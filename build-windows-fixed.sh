#!/bin/bash

# Define image
IMAGE="electronuserland/builder:wine"

echo "🐳 Pulling Docker image ($IMAGE)..."
docker pull $IMAGE

echo "🔨 Starting Windows Build with Native Dependencies..."
echo "Note: This script ensures Windows-specific native dependencies are installed."

# Run the build with Windows-specific dependency installation
# We map the current directory to /project
# We run 'npm install' to ensure dependencies are correct for the container OS
# We specifically install Windows canvas binaries before building
docker run --rm \
  -v "$(pwd)":/project \
  -w /project \
  $IMAGE \
  /bin/bash -c "
    npm install && 
    npm install --platform=win32 --arch=x64 @napi-rs/canvas-win32-x64-msvc &&
    npm run build:win
  "

# Check status
if [ $? -eq 0 ]; then
    echo "✅ Build Successful!"
    echo "📁 Artifacts are in 'dist' or 'out' directory."
    
    # Attempt to fix permissions since Docker runs as root
    echo "🔧 Fixing file permissions..."
    if [ -n "$SUDO_USER" ]; then
        USER_ID=$(id -u $SUDO_USER)
        GROUP_ID=$(id -g $SUDO_USER)
    else
        USER_ID=$(id -u)
        GROUP_ID=$(id -g)
    fi
    
    # Try to chown without sudo first (might fail), then warn
    chown -R $USER_ID:$GROUP_ID dist out node_modules 2>/dev/null || \
    echo "⚠️  Some files are owned by root. Run: sudo chown -R $USER_ID:$GROUP_ID dist out node_modules"
else
    echo "❌ Build Failed."
    exit 1
fi
