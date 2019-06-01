const express = require('express');
const app = express();
const bodyParser = require('body-parser');
const ObjectID = require('mongodb').ObjectID;
const router = express.Router();
const mqtt = require('mqtt');
const config = require('./config/serverConfig');
const mqttConfig = require('./config/mqttConfig');
const initDb = require('./config/dbconfig').initDb;
let db = null;

(async () => {
    initDb().then(
        connection => {
            db = connection
        },
        error => {
            process.exit();
        }
    );

    app.use(bodyParser.urlencoded({ extended: true }));
    app.use(bodyParser.json());

    //MQTT connection
    try {
        var mqttClient = mqtt.connect(`mqtt://${mqttConfig.options.host}:${mqttConfig.options.port}`);
        mqttClient.on('connect', function (err, succ) {
            Object.entries(mqttConfig.options.devices).forEach(function (pair) {
                if (pair[1] == "temperature") {
                    mqttClient.subscribe(`/devices/${pair[0]}/temperature`);
                }
            })
        });
    } catch (e) {
        console.log("Error on mqtt connection");
    }

    //MQTT temperature update
    try {
        mqttClient.on('message', async function (topic, message) {
            let chip = topic.split("/")[2];
            let newState = {
                temperature: +message.toString(),
                timestamp: Date.now()
            }
            let device = await db.collection('devices').findOne({
                $or: [
                    { chipId: chip }
                ]
            });

            db.collection('devices').findOneAndUpdate(
                { "chipId": chip },
                { $set: { "state": newState } },
                { returnOriginal: false }, function (err, result) {
                    if (err || !result) {
                        console.log("An error occured when trying to update temperature");
                    }
                });

        });
    } catch (e) {
        console.log("Error on mqtt messaging");
    }

    router.use(function (req, res, next) {
        console.log('Request was made by: ' + req.ip);
        next();
    });

    router.get('/',
        function (req, res) {
            db.collection('devices', function (err, collection) {
                collection.find().toArray(function (err, items) {
                    if (err) {
                        return res.status(500)
                            .json({ message: 'An error occured' });
                    }
                    return res.status(200)
                        .json(items);
                });
            });
        });

    router.get('/:id',
        async function (req, res) {
            var id = ObjectID.isValid(req.params.id) ? ObjectID(req.params.id) : undefined;
            if (id == undefined) {
                return res.status(404)
                    .json({ message: 'Device id format is not supported' });
            }

            try {
                let device = await db.collection('devices').findOne({ _id: id });
                if (device) {
                    return res.status(200)
                        .json(device);
                } else {
                    return res.status(404)
                        .json({ message: 'Device was not found in the database.' });
                }
            } catch (e) {
                return res.status(500)
                    .json({ message: 'Some error' });
            }
        });

    router.post('/',
        async function (req, res) {

            let device = await db.collection('devices').findOne({
                $or: [
                    { chipId: req.body.chipId }
                ]
            });

            if (device) {
                return res.status(409)
                    .json({ message: `Device ${req.body.chipId} already exists` });
            } else {
                let req_device = {};
                for (let item in req.body) {
                    req_device[item.toString()] = req.body[item];
                }
                db.collection('devices').insertOne(req_device, function (err, result) {
                    if (err) {
                        return res.status(500)
                            .json({ message: 'An error occured.' });
                    } else {
                        return res.status(201)
                            .header('Location', `/devices/${req_device._id}`)
                            .json(req_device);
                    }
                });
            }
        });

    router.patch('/:id',
        async function (req, res) {
            var id = ObjectID.isValid(req.params.id) ? ObjectID(req.params.id) : undefined;
            let device = null;

            if (id == undefined) {
                return res.status(404)
                    .json({ message: 'Device id format is not supported' });
            } else if (!id) {
                return res.status(404)
                    .json({ message: 'Device id was not supplied' });
            } else {
                device = await db.collection('devices').findOne({ _id: id });
            }

            if (device) {
                if (!req.body) {
                    return res.status(400).json();
                }
                let req_device = {};
                for (let item in req.body) {
                    req_device[item.toString()] = req.body[item];
                }
                req_device["state"].lastUpdate = Date.now();
                mqttClient.publish(`/devices/${device.chipId}/status`, req_device.state["status"].toString(), function (err) {
                    if (!err) {
                        console.log("Yay, it works");
                    } else {
                        console.log(err);
                    }
                });



                db.collection('devices').findOneAndUpdate(
                    { "_id": id },
                    { $set: { "name": req_device.name || device.name, "state": req_device.state || device.state } },
                    { returnOriginal: false }, function (err, result) {
                        if (err) {
                            return res.status(500)
                                .json({ message: 'An error occured.' });
                        }
                        if (result) {
                            return res.status(204)
                                .header('Location', `/devices/${id}`)
                                .end();
                        } else {
                            return res.status(500)
                                .json({ message: 'An error occured.' });
                        }
                    });
            } else {
                return res.status(404)
                    .json({ message: 'Device was not found in the database.' });
            }
        });

    router.delete('/:id',
        async function (req, res) {
            let id = ObjectID.isValid(req.params.id) ? ObjectID(req.params.id) : undefined;
            let device = null;

            if (id == undefined) {
                return res.status(404)
                    .json({ message: 'Device id format is not supported' });
            } else if (!id) {
                return res.status(404)
                    .json({ message: 'Device id was not supplied' });
            } else {
                device = await db.collection('devices').findOne({ _id: id });
            }

            if (device) {
                db.collection('devices').deleteOne({ _id: id }, function (err, result) {
                    if (err) {
                        return res.status(500)
                            .json({ message: 'An error occured.' });
                    }
                    if (result) {
                        return res.status(204)
                            .end();
                    } else {
                        return res.status(404)
                            .json({ message: 'Device was not found in the database.' });
                    }
                });
            } else {
                return res.status(404)
                    .json({ message: 'Device was not found in the database.' });
            }
        });


    app.use('/devices', router);
    app.use((req, res) => {
        res.status(500)
            .json();
    })
    app.listen(
        config.options.port,
        (err) => {
            if (err) {
                console.log(`Error starting the server: ${err}`);
            } else {
                console.log(`Server started on port ${config.options.port}`);
            }
        }
    );
})();