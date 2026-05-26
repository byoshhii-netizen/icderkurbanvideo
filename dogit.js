const { execSync } = require('child_process');
const cwd = 'C:\\Users\\OrtaPC\\Documents\\icderrr-main\\kurban-video';
const opts = { cwd, stdio: 'inherit', shell: 'cmd.exe' };
try {
  execSync('git add .', opts);
  execSync('git commit -m "fix ve yeni ozellikler"', opts);
  execSync('git push', opts);
  console.log('\n=== PUSH TAMAM ===');
} catch(e) {
  console.error('HATA:', e.message);
}
