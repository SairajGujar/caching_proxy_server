import { Command } from "commander";
import axios from "axios";
import express from "express";
import Redis from "ioredis";

const redis = new Redis();
const program = new Command();

program
  .name("proxy server")
  .description("CLI for using proxy server")
  .version("1.0.0");

program
  .command("start")
  .requiredOption("-p, --port <number>", "Port number")
  .requiredOption("-u, --url <string>", "Base URL")
  .action(({ port, url }) => {
    port = parseInt(port, 10);
    if (isNaN(port) || port <= 0 || port > 65535) {
      console.error("Please provide a valid port number (1-65535).");
      process.exit(1);
    }
    if (!url) {
      console.log("Please provide a valid url");
      process.exit(1);
    }
    const app = express();

    async function handleRequest(req, res) {
      const newurl = `${url.replace(/\/+$/, "")}/${req.originalUrl.replace(/^\/+/, "")}`;
      console.log(`Forwarding request to: ${newurl}`);

      const cachedResponse = await redis.get(newurl);

      if (cachedResponse) {
        res.setHeader("X-Cache", "HIT");
        return res.status(200).send(JSON.parse(cachedResponse));
      }

      try {
        const response = await axios.get(newurl);
        const responseData = response.data;

        await redis.set(newurl, JSON.stringify(responseData), "EX", 3600);
        res.setHeader("X-Cache", "MISS");
        res.status(response.status).send(responseData);
      } catch (error) {
        console.error(`Request failed with status code: ${error.response ? error.response.status : 500}`);
        res.status(error.response ? error.response.status : 500).send(error.message);
      }
    }

    app.get("*", handleRequest);

    app.listen(port, () => {
      console.log(`Listening on port ${port}`);
    });
  });

program
  .command("clear")
  .action(async () => {
    await redis.flushall();
    console.log("Cache cleared");
  });

program.parse(process.argv);
