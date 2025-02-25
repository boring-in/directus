import fs from 'fs';
import path from 'path';

// Read the CSS file
const cssContent = fs.readFileSync(path.resolve('dist/style.css'), 'utf8');

// Create a module that exports the CSS content
const moduleContent = `
// This file is auto-generated. Do not edit.
export default ${JSON.stringify(cssContent)};
`;

// Write the module
fs.writeFileSync(path.resolve('src/css-content.js'), moduleContent);
