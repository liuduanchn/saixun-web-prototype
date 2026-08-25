$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "..\scripts\password-hash-utils.ps1")

$bytes = [Text.Encoding]::UTF8.GetBytes("abc")
try {
  $actual = Get-Sha256Hex $bytes
  $expected = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
  if ($actual -cne $expected) {
    throw "Unexpected SHA-256 hexadecimal output."
  }
} finally {
  [Array]::Clear($bytes, 0, $bytes.Length)
}
