@echo off
git add .
git commit -m "production: crash koruma, atomic DB kayit, backup, healthcheck, ac() wrapper"
git push
echo DONE
