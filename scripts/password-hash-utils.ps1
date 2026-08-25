function Get-Sha256Hex {
  param(
    [Parameter(Mandatory = $true)]
    [byte[]]$Bytes
  )

  $sha256 = [Security.Cryptography.SHA256]::Create()
  $digest = $null
  try {
    $digest = $sha256.ComputeHash($Bytes)
    return -join ($digest | ForEach-Object { $_.ToString("x2") })
  } finally {
    if ($digest) { [Array]::Clear($digest, 0, $digest.Length) }
    $sha256.Dispose()
  }
}
