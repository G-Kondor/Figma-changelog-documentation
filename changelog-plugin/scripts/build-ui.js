const fs = require('fs');
const path = require('path');

const template = fs.readFileSync(path.join(__dirname, '..', 'src', 'ui.html'), 'utf8');
const bundle = fs.readFileSync(path.join(__dirname, '..', 'ui-bundle.js'), 'utf8');

const output = template.replace(
  '<!-- SCRIPT_PLACEHOLDER -->',
  `<script>${bundle}</script>`
);

fs.writeFileSync(path.join(__dirname, '..', 'ui.html'), output);
console.log('Built ui.html');
