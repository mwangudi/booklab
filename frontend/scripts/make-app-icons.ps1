# Builds the PWA icons from public/logo.jpeg.
#
#   icon-192.png / icon-512.png   the installed app icon
#   icon-maskable-512.png         padded so Android's circular mask does not
#                                 crop the artwork
#   apple-touch-icon.png          iOS home screen
#
# Re-run if the artwork changes:  ./make-app-icons.ps1

Add-Type -AssemblyName System.Drawing

$pub = Resolve-Path (Join-Path $PSScriptRoot '..\public')
$src = Join-Path $pub 'logo.jpeg'
if (-not (Test-Path $src)) { throw "Source artwork not found: $src" }

# The logo ships on a black field and is wider than it is tall, so it is placed
# on a square canvas rather than stretched.
$BRAND = [System.Drawing.Color]::FromArgb(255, 24, 24, 27)

function New-Icon {
    param([string]$Out, [int]$Size, [double]$Inset)

    $img = [System.Drawing.Image]::FromFile($src)
    $canvas = New-Object System.Drawing.Bitmap $Size, $Size
    $gfx = [System.Drawing.Graphics]::FromImage($canvas)
    $gfx.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $gfx.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $gfx.Clear($BRAND)

    $avail = $Size * (1 - 2 * $Inset)
    $scale = [Math]::Min($avail / $img.Width, $avail / $img.Height)
    $w = [int]($img.Width * $scale); $h = [int]($img.Height * $scale)
    $gfx.DrawImage($img, [int](($Size - $w) / 2), [int](($Size - $h) / 2), $w, $h)
    $gfx.Dispose()

    $path = Join-Path $pub $Out
    $canvas.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    "  $Out  ${Size}x${Size}  $((Get-Item $path).Length) bytes"
    $canvas.Dispose(); $img.Dispose()
}

New-Icon -Out 'icon-192.png' -Size 192 -Inset 0.06
New-Icon -Out 'icon-512.png' -Size 512 -Inset 0.06
# Android masks icons to a circle and can crop ~10% off each edge.
New-Icon -Out 'icon-maskable-512.png' -Size 512 -Inset 0.18
New-Icon -Out 'apple-touch-icon.png' -Size 180 -Inset 0.06
