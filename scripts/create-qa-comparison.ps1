param(
  [string]$SourcePath = "reference-option-1.png",
  [string]$ImplementationPath = "implementation-revised.png"
)

Add-Type -AssemblyName System.Drawing

function Save-Comparison {
  param(
    [System.Drawing.Image]$Source,
    [System.Drawing.Image]$Implementation,
    [System.Drawing.Rectangle]$Crop,
    [string]$OutputPath
  )

  $canvas = New-Object System.Drawing.Bitmap ($Crop.Width * 2), $Crop.Height
  $graphics = [System.Drawing.Graphics]::FromImage($canvas)
  $graphics.Clear([System.Drawing.Color]::FromArgb(3, 19, 43))
  $graphics.DrawImage($Source, (New-Object System.Drawing.Rectangle 0, 0, $Crop.Width, $Crop.Height), $Crop, [System.Drawing.GraphicsUnit]::Pixel)
  $graphics.DrawImage($Implementation, (New-Object System.Drawing.Rectangle $Crop.Width, 0, $Crop.Width, $Crop.Height), $Crop, [System.Drawing.GraphicsUnit]::Pixel)
  $canvas.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $graphics.Dispose()
  $canvas.Dispose()
}

$sourceOriginal = [System.Drawing.Image]::FromFile((Resolve-Path -LiteralPath $SourcePath))
$implementation = [System.Drawing.Image]::FromFile((Resolve-Path -LiteralPath $ImplementationPath))
$sourceNormalized = New-Object System.Drawing.Bitmap $implementation.Width, $implementation.Height
$normalizer = [System.Drawing.Graphics]::FromImage($sourceNormalized)
$normalizer.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$normalizer.DrawImage($sourceOriginal, 0, 0, $implementation.Width, $implementation.Height)
$sourceNormalized.Save((Join-Path $PWD "source-normalized.png"), [System.Drawing.Imaging.ImageFormat]::Png)

Save-Comparison -Source $sourceNormalized -Implementation $implementation -Crop (New-Object System.Drawing.Rectangle 0, 0, $implementation.Width, $implementation.Height) -OutputPath (Join-Path $PWD "qa-comparison-full.png")
Save-Comparison -Source $sourceNormalized -Implementation $implementation -Crop (New-Object System.Drawing.Rectangle 215, 250, 920, 365) -OutputPath (Join-Path $PWD "qa-comparison-hero.png")
Save-Comparison -Source $sourceNormalized -Implementation $implementation -Crop (New-Object System.Drawing.Rectangle 215, 600, 920, 315) -OutputPath (Join-Path $PWD "qa-comparison-bottom.png")

$normalizer.Dispose()
$sourceNormalized.Dispose()
$sourceOriginal.Dispose()
$implementation.Dispose()
