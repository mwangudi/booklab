# Derives the two print variants of the shop logo from public/logo.jpeg.
#
#   logo-print.png  colour artwork, black field knocked out to white, for the
#                   invoice / delivery note / statement PDFs
#   logo-bw.png     hard black-and-white, for thermal receipts, which cannot
#                   render colour and would otherwise dither into grey
#
# Re-run this if the artwork ever changes:  ./make-print-logos.ps1

Add-Type -AssemblyName System.Drawing

$pub = Resolve-Path (Join-Path $PSScriptRoot '..\public')
$src = Join-Path $pub 'logo.jpeg'
if (-not (Test-Path $src)) { throw "Source artwork not found: $src" }

# Anything this dark is the background field the logo ships on, not artwork.
$FIELD = 40
# Luminance below this becomes ink on the monochrome copy.
$INK = 150

function Convert-Logo {
    param([string]$Out, [switch]$Monochrome, [int]$Width)

    $img = [System.Drawing.Image]::FromFile($src)
    $bmp = New-Object System.Drawing.Bitmap $img
    $img.Dispose()

    $w = $bmp.Width; $h = $bmp.Height
    $rect = New-Object System.Drawing.Rectangle 0, 0, $w, $h
    $data = $bmp.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadWrite, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $len = $w * $h * 4
    $buf = New-Object byte[] $len
    [System.Runtime.InteropServices.Marshal]::Copy($data.Scan0, $buf, 0, $len)

    for ($i = 0; $i -lt $len; $i += 4) {
        $b = $buf[$i]; $g = $buf[$i + 1]; $r = $buf[$i + 2]
        $max = [Math]::Max($r, [Math]::Max($g, $b))
        if ($max -lt $FIELD) {
            $buf[$i] = 255; $buf[$i + 1] = 255; $buf[$i + 2] = 255
        } elseif ($Monochrome) {
            $lum = (0.299 * $r) + (0.587 * $g) + (0.114 * $b)
            $v = if ($lum -lt $INK) { 0 } else { 255 }
            $buf[$i] = $v; $buf[$i + 1] = $v; $buf[$i + 2] = $v
        }
    }

    [System.Runtime.InteropServices.Marshal]::Copy($buf, 0, $data.Scan0, $len)
    $bmp.UnlockBits($data)

    $th = [int][Math]::Round($h * $Width / $w)
    $small = New-Object System.Drawing.Bitmap $Width, $th
    $gfx = [System.Drawing.Graphics]::FromImage($small)
    $gfx.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $gfx.Clear([System.Drawing.Color]::White)
    $gfx.DrawImage($bmp, 0, 0, $Width, $th)
    $gfx.Dispose()

    $path = Join-Path $pub $Out
    $small.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    "  $Out  $Width x $th  $((Get-Item $path).Length) bytes"
    $small.Dispose(); $bmp.Dispose()
}

Convert-Logo -Out 'logo-print.png' -Width 600
Convert-Logo -Out 'logo-bw.png' -Monochrome -Width 420
