#!/usr/bin/env python3
import os
import argparse
import boto3
from botocore import UNSIGNED
from botocore.config import Config
from tqdm import tqdm

def download_tiger_dataset(output_dir, prefix, max_files):
    """Downloads files from the open TIGER AWS S3 bucket."""
    bucket_name = 'tiger-training'
    
    # Configure S3 client for anonymous access (no AWS credentials required)
    # Configure S3 client for anonymous access (no AWS credentials required)
    s3 = boto3.client('s3', region_name='us-west-2', 
    config=Config(signature_version=UNSIGNED))
    paginator = s3.get_paginator('list_objects_v2')
    
    print(f"[*] Querying s3://{bucket_name}/{prefix}...")
    pages = paginator.paginate(Bucket=bucket_name, Prefix=prefix)
    
    files_to_download = []
    for page in pages:
        if 'Contents' in page:
            for obj in page['Contents']:
                # Skip directory markers
                if obj['Key'].endswith('/'):
                    continue
                files_to_download.append(obj)
                if max_files and len(files_to_download) >= max_files:
                    break
        if max_files and len(files_to_download) >= max_files:
            break

    if not files_to_download:
        print("[!] No files found matching that prefix.")
        return

    print(f"[+] Found {len(files_to_download)} files to download.")
    
    # Download loop
    for obj in files_to_download:
        key = obj['Key']
        size = obj['Size']
        local_path = os.path.join(output_dir, key)
        
        # Create subdirectories if necessary
        os.makedirs(os.path.dirname(local_path), exist_ok=True)
        
        # Skip if file is already downloaded fully
        if os.path.exists(local_path) and os.path.getsize(local_path) == size:
            print(f"    -> Skipping {key} (Already downloaded)")
            continue
            
        print(f"[*] Downloading {key} ({(size / 1024 / 1024):.2f} MB)")
        
        # Use boto3's built-in progress callback
        with tqdm(total=size, unit='B', unit_scale=True, desc=os.path.basename(key)) as pbar:
            s3.download_file(
                bucket_name, 
                key, 
                local_path,
                Callback=lambda bytes_transferred: pbar.update(bytes_transferred)
            )

def main():
    parser = argparse.ArgumentParser(description="Download the TIGER Challenge Dataset (Breast Cancer TILs).")
    parser.add_argument("-o", "--output_dir", type=str, default="../data/tiger_dataset", 
                        help="Local directory to save the downloaded dataset.")
    parser.add_argument("-p", "--prefix", type=str, default="", 
                        help="Specific S3 folder to download (e.g., 'wsirois/'). Leave empty for everything.")
    parser.add_argument("-m", "--max_files", type=int, default=10, 
                        help="Maximum number of files to download (default is 10 for testing).")
    
    args = parser.parse_args()
    
    os.makedirs(args.output_dir, exist_ok=True)
    download_tiger_dataset(args.output_dir, args.prefix, args.max_files)
    print("\n[+] Download complete.")

if __name__ == "__main__":
    main()