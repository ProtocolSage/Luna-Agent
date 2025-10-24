import fetch, { Headers, Request, Response } from "node-fetch";

// @ts-ignore
global.fetch = fetch;
Object.assign(global, { Headers, Request, Response });
