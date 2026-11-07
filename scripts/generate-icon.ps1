$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$projectRoot = Split-Path -Parent $PSScriptRoot
$iconPath = Join-Path $projectRoot 'src-tauri/icons/icon.ico'
$previewPath = Join-Path $projectRoot 'artifacts/icon-preview.png'
$sizes = @(16, 20, 24, 32, 40, 48, 64, 96, 128, 256)
$images = @()

# Draw the original mark as geometry, then downsample each size independently.
$points = [System.Drawing.PointF[]]@(
    [System.Drawing.PointF]::new(15, 18),
    [System.Drawing.PointF]::new(24, 18),
    [System.Drawing.PointF]::new(31.5, 43),
    [System.Drawing.PointF]::new(39, 18),
    [System.Drawing.PointF]::new(47, 18),
    [System.Drawing.PointF]::new(35, 52),
    [System.Drawing.PointF]::new(27, 52)
)

New-Item -ItemType Directory -Path (Split-Path -Parent $previewPath) -Force | Out-Null
foreach ($size in $sizes) {
    $large = [System.Drawing.Bitmap]::new($size * 8, $size * 8)
    $canvas = [System.Drawing.Graphics]::FromImage($large)
    $bitmap = [System.Drawing.Bitmap]::new($size, $size)
    $output = [System.Drawing.Graphics]::FromImage($bitmap)
    $stream = [System.IO.MemoryStream]::new()
    try {
        $canvas.Clear([System.Drawing.Color]::FromArgb(0, 0, 128))
        $canvas.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
        $canvas.ScaleTransform($large.Width / 64.0, $large.Height / 64.0)
        $canvas.FillPolygon([System.Drawing.Brushes]::White, $points)

        $output.Clear([System.Drawing.Color]::FromArgb(0, 0, 128))
        $output.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $output.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $output.DrawImage($large, [System.Drawing.Rectangle]::new(0, 0, $size, $size))
        $bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
        $images += ,($stream.ToArray())
        if ($size -eq 256) {
            $bitmap.Save($previewPath, [System.Drawing.Imaging.ImageFormat]::Png)
        }
    }
    finally {
        $stream.Dispose()
        $output.Dispose()
        $bitmap.Dispose()
        $canvas.Dispose()
        $large.Dispose()
    }
}

# ICO directory entries point to full-color PNG images (0 represents 256 pixels).
$writer = [System.IO.BinaryWriter]::new([System.IO.File]::Create($iconPath))
try {
    $writer.Write([uint16]0)
    $writer.Write([uint16]1)
    $writer.Write([uint16]$sizes.Count)
    $offset = 6 + 16 * $sizes.Count
    for ($i = 0; $i -lt $sizes.Count; $i++) {
        $dimension = if ($sizes[$i] -eq 256) { 0 } else { $sizes[$i] }
        $writer.Write([byte]$dimension)
        $writer.Write([byte]$dimension)
        $writer.Write([byte]0)
        $writer.Write([byte]0)
        $writer.Write([uint16]1)
        $writer.Write([uint16]32)
        $writer.Write([uint32]$images[$i].Length)
        $writer.Write([uint32]$offset)
        $offset += $images[$i].Length
    }
    foreach ($bytes in $images) { $writer.Write([byte[]]$bytes) }
}
finally { $writer.Dispose() }

Write-Output "Generated $iconPath ($($sizes -join ', ') px)"
