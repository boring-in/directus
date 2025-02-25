import { execSync } from 'child_process';
import { readdirSync, statSync } from 'fs';
import { join } from 'path';

// Extension types to look for
const extensionTypes = [
    'display-',
    'endpoint-',
    'interface-',
    'module-',
    'operation-',
    'theme-'
];

// Get current working directory and ensure we're in the right place
const cwd = process.cwd();
console.log('Current working directory:', cwd);

// Get all directories in the current folder
const items = readdirSync(cwd);

// Filter for extension directories
const extensionDirs = items.filter(item => {
    const stats = statSync(join(cwd, item));
    return stats.isDirectory() && extensionTypes.some(type => item.startsWith(type));
});

// Track failed builds
const failedBuilds = [];

// Process each extension directory
extensionDirs.forEach(dir => {
    console.log(`Building ${dir}...`);
    try {
        // Install CLI and build
        execSync(`cd ${dir} && npm install && npm run build`, { stdio: 'inherit' });
        console.log(`Successfully built ${dir}`);
    } catch (error) {
        console.error(`Failed to build ${dir}: ${error.message}`);
        failedBuilds.push({ dir, error: error.message });
    }
});

// Display summary of failed builds
if (failedBuilds.length > 0) {
    console.log('\n=== Failed Builds Summary ===');
    failedBuilds.forEach(({ dir, error }) => {
        console.log(`\n${dir}:`);
        console.log(`Error: ${error}`);
    });
    console.log(`\nTotal failed builds: ${failedBuilds.length}`);
}
