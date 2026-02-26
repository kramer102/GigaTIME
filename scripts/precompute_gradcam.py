import sys
from pathlib import Path
import numpy as np
import torch
from PIL import Image
from tqdm import tqdm

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "scripts"))

import archs
from frontend.api.config import load_runtime_config

CONFIG = load_runtime_config(ROOT)
DATA_DIR = CONFIG.data_dir
MODEL_PATH = CONFIG.model_path
OUT_DIR = CONFIG.precomputed_dir

MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)

def load_model():
    if torch.cuda.is_available():
        device = torch.device("cuda")
    elif torch.backends.mps.is_available():
        device = torch.device("mps")
    else:
        device = torch.device("cpu")
        
    model = archs.gigatime(num_classes=CONFIG.num_classes, input_channels=CONFIG.input_channels)
    state_dict = torch.load(str(MODEL_PATH), map_location="cpu")
    model.load_state_dict(state_dict)
    model.to(device).eval()
    return model, device

def preprocess(img_array: np.ndarray, size: int | None = None) -> np.ndarray:
    target_size = size or CONFIG.input_size
    img = Image.fromarray(img_array).resize((target_size, target_size), Image.BILINEAR)
    arr = np.array(img, dtype=np.float32) / 255.0
    arr = (arr - MEAN) / STD
    return arr.transpose(2, 0, 1)

class GradCAM:
    def __init__(self, model, target_layer):
        self.model = model
        self.target_layer = target_layer
        self.gradients = None
        self.activations = None

        target_layer.register_forward_hook(self.save_activation)
        target_layer.register_full_backward_hook(self.save_gradient)

    def save_activation(self, module, input, output):
        self.activations = output

    def save_gradient(self, module, grad_input, grad_output):
        self.gradients = grad_output[0]

    def generate(self, input_tensor, class_idx, output=None):
        if output is None:
            self.model.zero_grad()
            output = self.model(input_tensor)
        else:
            self.model.zero_grad()
            
        target = output[:, class_idx, :, :].sum()
        target.backward(retain_graph=True)

        gradients = self.gradients.cpu().data.numpy()[0]
        activations = self.activations.cpu().data.numpy()[0]

        weights = np.mean(gradients, axis=(1, 2))
        cam = np.zeros(activations.shape[1:], dtype=np.float32)

        for i, w in enumerate(weights):
            cam += w * activations[i]

        cam = np.maximum(cam, 0)
        if np.max(cam) > 0:
            cam = cam / np.max(cam)
        
        # Resize to match input size
        cam_img = Image.fromarray(cam).resize((input_tensor.shape[3], input_tensor.shape[2]), Image.BILINEAR)
        return np.array(cam_img)

def infer_gradcam(model, device, chw: np.ndarray, window: int | None = None) -> np.ndarray:
    tensor = torch.from_numpy(chw).unsqueeze(0).to(device)
    _, c, h, w = tensor.shape
    window_size = window or CONFIG.window_size
    
    output_cam = np.zeros((CONFIG.num_classes, h, w), dtype=np.float32)
    
    # We can compute Grad-CAM analytically for this architecture.
    # The target layer is conv0_4, and the final layer is a 1x1 conv.
    # Y^c = sum_{i,j} output[c, i, j]
    # output[c, i, j] = sum_k W_{c, k} A_{k, i, j} + b_c
    # dY^c / dA_{k, i, j} = W_{c, k}
    # alpha_k^c = 1/Z sum_{i,j} W_{c, k} = W_{c, k}
    # Grad-CAM^c = ReLU(sum_k alpha_k^c A_k) = ReLU(output[c] - b_c)
    
    with torch.no_grad():
        for i in range(0, h, window_size):
            for j in range(0, w, window_size):
                win = tensor[:, :, i:i + window_size, j:j + window_size]
                output = model(win)
                
                for class_idx in range(CONFIG.num_classes):
                    bias = model.final.bias[class_idx].item()
                    cam = output[0, class_idx, :, :].cpu().numpy() - bias
                    cam = np.maximum(cam, 0)
                    
                    if np.max(cam) > 0:
                        cam = cam / np.max(cam)
                        
                    output_cam[class_idx, i:i + window_size, j:j + window_size] = cam
                    
    return output_cam

def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    tiles = sorted({
        p.name.replace("_he.png", "")
        for p in DATA_DIR.glob("*_he.png")
    })

    if not tiles:
        print(f"No *_he.png files found in {DATA_DIR}")
        return

    print(f"Found {len(tiles)} tiles in {DATA_DIR}")
    print("Loading model...")
    model, device = load_model()
    print(f"Model loaded on {device}")

    for tile_name in tqdm(tiles, desc="Pre-computing Grad-CAM"):
        he_path = DATA_DIR / f"{tile_name}_he.png"
        img = np.array(Image.open(he_path).convert("RGB"))

        chw = preprocess(img)
        cams = infer_gradcam(model, device, chw)
        
        # Save as uint8 to save space
        cams_uint8 = (cams * 255).astype(np.uint8)
        np.savez_compressed(OUT_DIR / f"{tile_name}_cam.npz", cams=cams_uint8)

    print(f"\nDone. Saved Grad-CAM maps to {OUT_DIR}")

if __name__ == "__main__":
    main()
