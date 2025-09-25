#!/bin/bash

# Google Cloud CLI Setup Script
# Fix GPG key and repository setup

echo "Setting up Google Cloud CLI..."

# Step 1: Create keyring directory
sudo mkdir -p /usr/share/keyrings

# Step 2: Import GPG key properly
curl https://packages.cloud.google.com/apt/doc/apt-key.gpg | sudo gpg --dearmor -o /usr/share/keyrings/cloud.google.gpg

# Step 3: Remove old repository entry and add correct one
sudo rm -f /etc/apt/sources.list.d/google-cloud-sdk.list
echo "deb [signed-by=/usr/share/keyrings/cloud.google.gpg] https://packages.cloud.google.com/apt cloud-sdk main" | sudo tee -a /etc/apt/sources.list.d/google-cloud-sdk.list

# Step 4: Update package list
sudo apt update

# Step 5: Install Google Cloud CLI
sudo apt install google-cloud-cli

echo "Installation complete! Now run these commands to authenticate:"
echo "gcloud auth login"
echo "gcloud auth application-default login"