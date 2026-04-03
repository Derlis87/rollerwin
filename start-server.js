const { spawn } = require('child_process');
const fs = require('fs');

const log = fs.openSync('/home/z/my-project/dev.log', 'a');

function start() {
    const child = spawn('node', ['.next/standalone/server.js', '-p', '3000'], {
        cwd: '/home/z/my-project',
        detached: false,
        stdio: ['ignore', log, log]
    });
    
    child.on('exit', (code) => {
        console.log('Server exited with code:', code);
        setTimeout(start, 2000);
    });
    
    child.on('error', (err) => {
        console.log('Server error:', err.message);
        setTimeout(start, 2000);
    });
}

start();
