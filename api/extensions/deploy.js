import { readFileSync, readdirSync, statSync, mkdirSync, copyFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Get current directory name
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuration
const sourceDir = __dirname;
const targetDir = join(__dirname, '..', 'StockApp-Deploy', 'extensions');

// Extension types to look for
const extensionTypes = [
    'display-',
    'endpoint-',
    'interface-',
    'module-',
    'operation-',
    'theme-'
];

// Ensure target directory exists
if (!existsSync(targetDir)) {
    mkdirSync(targetDir, { recursive: true });
}

// Get all directories in the source
const items = readdirSync(sourceDir);

// Filter for extension directories
const extensionDirs = items.filter(item => {
    const stats = statSync(join(sourceDir, item));
    return stats.isDirectory() && extensionTypes.some(type => item.startsWith(type));
});

// Process each extension directory
extensionDirs.forEach(dir => {
    const sourcePath = join(sourceDir, dir);
    const targetPath = join(targetDir, dir);
    
    // Check for compiled versions or src directory
    const distPath = join(sourcePath, 'dist');
    const buildPath = join(sourcePath, 'build');
    const srcPath = join(sourcePath, 'src');
    
    let sourceToCopy = null;
    let isCompiled = true;
    
    if (existsSync(distPath)) {
        sourceToCopy = distPath;
    } else if (existsSync(buildPath)) {
        sourceToCopy = buildPath;
    } else if (existsSync(srcPath)) {
        sourceToCopy = srcPath;
        isCompiled = false;
    }
    
    if (sourceToCopy) {
        console.log(`Deploying ${dir}${!isCompiled ? ' (from src)' : ''}...`);
        
        // Create target directory if it doesn't exist
        if (!existsSync(targetPath)) {
            mkdirSync(targetPath, { recursive: true });
        }
        
        // Copy files
        copyDirectory(sourceToCopy, join(targetPath, isCompiled ? '' : 'src'));
        
        // Copy package.json if it exists
        const packageJsonPath = join(sourcePath, 'package.json');
        if (existsSync(packageJsonPath)) {
            copyFileSync(packageJsonPath, join(targetPath, 'package.json'));
        }
    } else {
        console.log(`Skipping ${dir} - no source files found`);
    }
});

console.log('Deployment complete!');

/**
 * Recursively copy a directory
 * @param {string} src Source directory path
 * @param {string} dest Destination directory path
 */
function copyDirectory(src, dest) {
    const entries = readdirSync(src, { withFileTypes: true });
    
    // Create destination directory if it doesn't exist
    if (!existsSync(dest)) {
        mkdirSync(dest, { recursive: true });
    }
    
    entries.forEach(entry => {
        const srcPath = join(src, entry.name);
        const destPath = join(dest, entry.name);
        
        if (entry.isDirectory()) {
            copyDirectory(srcPath, destPath);
        } else {
            copyFileSync(srcPath, destPath);
        }
    });
}
