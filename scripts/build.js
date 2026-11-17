import { mkdir, copyFile, cp } from 'node:fs/promises';
await mkdir('dist', { recursive: true });
for (const name of ['index.html','style.css','app.js','icon.svg']) await copyFile(name, `dist/${name}`);
await cp('src', 'dist/src', { recursive: true });
console.log('Built dist/ — static assets, no dependencies.');
