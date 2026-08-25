Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
. (Join-Path $PSScriptRoot "password-hash-utils.ps1")

$form = [Windows.Forms.Form]::new()
$form.Text = "Configure Saixun demo password"
$form.ClientSize = [Drawing.Size]::new(420, 210)
$form.StartPosition = "CenterScreen"
$form.FormBorderStyle = "FixedDialog"
$form.MaximizeBox = $false
$form.MinimizeBox = $false
$form.TopMost = $true

$description = [Windows.Forms.Label]::new()
$description.Text = "The password is hashed locally with SHA-256 and is never saved as plain text."
$description.Location = [Drawing.Point]::new(24, 20)
$description.AutoSize = $true
$form.Controls.Add($description)

$firstLabel = [Windows.Forms.Label]::new()
$firstLabel.Text = "Password"
$firstLabel.Location = [Drawing.Point]::new(24, 62)
$firstLabel.AutoSize = $true
$form.Controls.Add($firstLabel)

$firstBox = [Windows.Forms.TextBox]::new()
$firstBox.Location = [Drawing.Point]::new(118, 58)
$firstBox.Size = [Drawing.Size]::new(270, 28)
$firstBox.UseSystemPasswordChar = $true
$form.Controls.Add($firstBox)

$secondLabel = [Windows.Forms.Label]::new()
$secondLabel.Text = "Confirm"
$secondLabel.Location = [Drawing.Point]::new(24, 103)
$secondLabel.AutoSize = $true
$form.Controls.Add($secondLabel)

$secondBox = [Windows.Forms.TextBox]::new()
$secondBox.Location = [Drawing.Point]::new(118, 99)
$secondBox.Size = [Drawing.Size]::new(270, 28)
$secondBox.UseSystemPasswordChar = $true
$form.Controls.Add($secondBox)

$saveButton = [Windows.Forms.Button]::new()
$saveButton.Text = "Save hash config"
$saveButton.Location = [Drawing.Point]::new(244, 154)
$saveButton.Size = [Drawing.Size]::new(144, 34)
$form.AcceptButton = $saveButton
$form.Controls.Add($saveButton)

$cancelButton = [Windows.Forms.Button]::new()
$cancelButton.Text = "Cancel"
$cancelButton.Location = [Drawing.Point]::new(145, 154)
$cancelButton.Size = [Drawing.Size]::new(88, 34)
$form.CancelButton = $cancelButton
$form.Controls.Add($cancelButton)

$saveButton.Add_Click({
  if ([string]::IsNullOrEmpty($firstBox.Text) -or $firstBox.Text -cne $secondBox.Text) {
    [Windows.Forms.MessageBox]::Show("The two passwords do not match.", "Cannot save", "OK", "Warning") | Out-Null
    return
  }

  $bytes = [Text.Encoding]::UTF8.GetBytes($firstBox.Text)
  try {
    $hash = Get-Sha256Hex $bytes
    $projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
    $envPath = Join-Path $projectRoot ".env.local"
    [IO.File]::WriteAllText($envPath, "VITE_DEMO_PASSWORD_HASH=$hash`r`n", [Text.UTF8Encoding]::new($false))
    [Windows.Forms.MessageBox]::Show("The local hash configuration has been saved.", "Configuration complete", "OK", "Information") | Out-Null
    $form.DialogResult = "OK"
    $form.Close()
  } finally {
    [Array]::Clear($bytes, 0, $bytes.Length)
    $firstBox.Clear()
    $secondBox.Clear()
    $hash = $null
  }
})

$form.Add_Shown({ $firstBox.Focus() })
$form.ShowDialog() | Out-Null
$form.Dispose()
