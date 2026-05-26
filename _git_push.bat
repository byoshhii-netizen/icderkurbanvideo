@echo off
git config user.email "push@icder.com"
git config user.name "icder"
git add .
git commit -m "ilk commit: icder kurban video sitesi"
git branch -M main
git push -u origin main
echo DONE
