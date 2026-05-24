# deploy.ps1 — Amore Gestao: build local + deploy Vercel
# Projeto Vercel: amore (prj_zAeLci5CzeIPNGM4FxQyZV5mzR0k)
# Dominio: amorefood.com.br / painel.amorefood.com.br

Set-Location $PSScriptRoot

Write-Host "`n=== 1. Git ===" -ForegroundColor Cyan
git add -A
$status = git status --porcelain
if ($status) {
    $msg = Read-Host "Mensagem do commit"
    git commit -m $msg
}
git push origin master

Write-Host "`n=== 2. Build ===" -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) { Write-Host "BUILD FALHOU — abortando deploy." -ForegroundColor Red; exit 1 }

Write-Host "`n=== 3. Deploy Vercel (projeto: amore) ===" -ForegroundColor Cyan
vercel --prod

Write-Host "`n=== Deploy concluido: painel.amorefood.com.br ===" -ForegroundColor Green
