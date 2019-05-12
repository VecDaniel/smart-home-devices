const client = require('mongodb').MongoClient;
const host = process.env.DB_HOST;
const port = process.env.DB_PORT;
const user = process.env.DB_USERNAME;
const pass = process.env.DB_PASSWORD;
const dbName = process.env.DB_DBNAME;
const connString = `mongodb://${user}:${pass}@${host}${port ? ':' + port : port}/${dbName}`;

function initDb() {
    return new Promise(function (resolve, reject) {
        client.connect(connString,{ useNewUrlParser: true }, function (err, db) {
            if (err)
                reject(err);
            resolve(db.db());
        })
    })
}

module.exports = {
    initDb
};