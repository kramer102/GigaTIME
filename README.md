# GigaTIME: Multimodal AI generates virtual population for tumor microenvironment modeling (Cell)

<div align="center">

[![Paper](https://img.shields.io/badge/Paper-Cell-red.svg)](https://aka.ms/gigatime-paper)
[![Model](https://img.shields.io/badge/🤗%20Hugging%20Face-Model-yellow)](https://aka.ms/gigatime-model)
[![License](https://img.shields.io/badge/License-Research%20Only-blue.svg)](https://github.com/prov-gigatime/GigaTIME/blob/main/LICENSE)
[![PyTorch](https://img.shields.io/badge/PyTorch-2.0+-EE4C2C.svg?logo=pytorch)](https://pytorch.org/)
[![Microsoft](https://img.shields.io/badge/Microsoft-Research-00A4EF.svg?logo=microsoft)](https://www.microsoft.com/en-us/research/)


*Official implementation of GigaTIME*

[📄 Paper](https://aka.ms/gigatime-paper) • [🤗 Model Card](https://aka.ms/gigatime-model) 

</div>

## Environment Setup

We recommend using [`uv`](https://docs.astral.sh/uv/) for environment and dependency management. The codebase has been tested with Python 3.11 using A100 GPUs for optimal reproducibility.

### 1) Install dependencies (default: CPU/macOS-safe torch)

```bash
uv sync
```

For a fresh local branch setup (sync + smoke check), run:

```bash
uv run inv setup-branch
```

For Linux + NVIDIA CUDA branch setup:

```bash
uv run inv setup-branch --cuda
```

If you also need Hugging Face tooling installed:

```bash
uv run inv setup-branch --hf
```

### 2) Run commands through uv

```bash
uv run python scripts/db_train.py ...
uv run python scripts/db_test.py ...
```

Quick dependency smoke check:

```bash
uv run python -c "import torch, torchvision, albumentations"
```

Install optional Hugging Face dependency only when needed:

```bash
uv sync --extra hf
```

### Offline container test (no internet)

Build and run a lightweight test container with network disabled:

```bash
uv run inv container-test
```

Equivalent Docker commands:

```bash
docker build -f Dockerfile.offline-test -t gigatime-offline-test .
docker run --rm --network none gigatime-offline-test
```

### Linux + NVIDIA CUDA (optional override)

If you are running on Linux with NVIDIA GPUs, install CUDA wheels from the PyTorch index after `uv sync`:

```bash
uv run pip install --upgrade --index-url https://download.pytorch.org/whl/cu124 torch torchvision
```

## Data 

A set of 50 paired H&E and mIF patches from the test set is available for evaluation. Download the sample data from [Dropbox](https://www.dropbox.com/scl/fi/8ampg43fs2yowt9y6vvr1/sample_test_data.zip?rlkey=bkg4w183qnvkh2dudqy3d8lsg&st=j2l463ug&dl=0).

After downloading, unzip the folder and place it in the `data` directory:

```bash
unzip sample_test_data.zip -d ./data/
```

Make sure the extracted folder are located in `./data/`.

## Pre-trained Model

`scripts/db_test.py` uses local model files by default and does not download from Hugging Face.

Default local checkpoint path:

```text
model/model.pth
```

Override the local checkpoint path if needed:

```bash
uv run python scripts/db_test.py --weights_path /absolute/path/to/model.pth ...
```

If the local checkpoint is missing, `db_test.py` exits with a clear `FileNotFoundError`.

Model card is still available at [HuggingFace](https://huggingface.co/prov-gigatime/GigaTIME).

## Tutorials

- **Inference Tutorial:** 

Learn how to load the model and run predictions on sample patches: [scripts/gigatime_testing.ipynb](scripts/gigatime_testing.ipynb)

- **Training Tutorial:** 

Understand the training workflow with a one-epoch demo: [scripts/gigatime_training.ipynb](scripts/gigatime_training.ipynb)

## Training GigaTIME cross-modal translator

We also release the script needed to train the GigaTIME model here. 

To train the model:

```bash
uv run python scripts/db_train.py --arch gigatime --tiling_dir "gigatime_training_path" --window_size 256 --batch_size 32 --sampling_prob 1 --name GigaTIME_model --output_dir "Output_Directory" --epochs 300 --input_h 512 --input_w 512 --lr 0.001 --loss BCEDiceLoss --val_sampling_prob 1 --num_workers 12 --gpu_ids 0 1 2 3 4 5 6 7 --crop True --metadata "Gigatime metadata file"
```

## Model Uses

### Intended Use
The data, code, and model checkpoints are intended to be used solely for (I) future research on pathology AI models and (II) reproducibility of the experimental results reported in the reference paper. The data, code, and model checkpoints are not intended to be used in clinical care or for any clinical decision-making purposes.

### Primary Intended Use
The primary intended use is to support AI researchers reproducing and building on top of this work. GigaTIME should be helpful for generating virtual mIF profiles from routine H&E pathology slides.

### Out-of-Scope Use
Any deployed use case of the model --- commercial or otherwise --- is out of scope. Although we evaluated the models using a broad set of publicly-available research benchmarks, the models and evaluations are intended for research use only and not intended for deployed use cases.

## License Notice

The model is not intended or made available for clinical use as a medical device, clinical support, diagnostic tool, or other technology intended to be used in the diagnosis, cure, mitigation, treatment, or prevention of disease or other conditions. The model is not designed or intended to be a substitute for professional medical advice, diagnosis, treatment, or judgment and should not be used as such. All users are responsible for reviewing the output of the developed model to determine whether the model meets the user’s needs and for validating and evaluating the model before any clinical use.

## Citation

```
@article{valanarasu2025multimodal,
  title={Multimodal AI generates virtual population for tumor microenvironment modeling},
  author={Valanarasu, Jeya Maria Jose and Xu, Hanwen and Usuyama, Naoto and Kim, Chanwoo and Wong, Cliff and Argaw, Peniel and Shimol, Racheli Ben and Crabtree, Angela and Matlock, Kevin and Bartlett, Alexandra Q and others},
  journal={Cell},
  year={2025},
  publisher={Elsevier}
}
```
