const options = {
    host: process.env.MQTT_HOST,
    port: process.env.MQTT_PORT,
    devices:{
        "00979449":"temperature",
        "0038A684":"light",
        "00979BF1":"air"
    }
}
module.exports = {
    options
};