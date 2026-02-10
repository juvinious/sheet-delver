module.exports = {
    apps: [{
        name: "sheet-delver",
        script: "npm",
        args: "run start",
        cwd: "./",
        env: {
            NODE_ENV: "production",
        }
    }]
};
