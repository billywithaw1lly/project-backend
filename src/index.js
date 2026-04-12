// require('dotenv').config({path: './env'})

import dotenv from "dotenv";
import connectDB from "./db/index.db.js";
import app from "../src/app.js";

dotenv.config({
  path: "./.env",
});

connectDB()
  .then(() => {
    const port = process.env.PORT || 8000;

    app.on ("error", (err) => {
        console.log("ERROR:", err);
        throw err;
    })

    app.listen(port, () => {
      console.log(`the server is listening on the port ${process.env.PORT}`);
    });
  })
  
  .catch((err) => {
    app.on("error", (error) => {
      console.log("ERROR :", error);
      throw error;
    });
    console.log("MONGODB connection fail!! ", err);
  });

/* 
import express from "express"
const app = express()

( async () => {
    try {
        await mongoose.connect(`${process.env.MONGODB_URI}/${DB_NAME}`);
        app.on("error", (error) => {
            console.log("error", error)
            throw error
        })

        app.listen(process.env.PORT, () => {
            console.log(`App is listening on port ${process.env.PORT}`)
        })
    } catch (error) {
        console.error("ERROR: ", error);
        throw error
    }
})()
*/
