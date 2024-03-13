const express = require('express');
const routes = require('./routes');
const fileQueue = require('./worker');

const app = express();
const port = process.env.PORT || 5000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/', routes);

fileQueue.init();

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
