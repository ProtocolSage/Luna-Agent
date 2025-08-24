param(
  [string]$ModelUrl = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin",
  [string]$OutPath = "models/ggml-base.en.bin"
)
New-Item -ItemType Directory -Force -Path (Split-Path $OutPath) | Out-Null
Invoke-WebRequest -Uri $ModelUrl -OutFile $OutPath
Write-Host "Model downloaded to $OutPath"
