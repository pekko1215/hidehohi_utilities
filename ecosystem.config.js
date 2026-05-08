module.exports = {
  apps: [
    {
      name: "hidehohi-utilities",
      script: "./src/index.ts",
      interpreter: "node",
      interpreter_args: "-r ts-node/register",
      watch: ["src"],
      ignore_watch: ["node_modules", "dist"],
      env: {
        NODE_ENV: "development",
      },
      env_production: {
        NODE_ENV: "production",
      },
      exp_backoff_restart_delay: 100,
    },
  ],
};
