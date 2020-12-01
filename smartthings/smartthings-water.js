var Promise = require('promise');

module.exports = function(RED) {

    function SmartthingsWaterNode(config) {
        RED.nodes.createNode(this, config);

        console.debug("SmartthingsWaterNode")
        console.debug(config);

        this.conf = RED.nodes.getNode(config.conf);
        this.name = config.name;
        this.device = config.device;

        this.state = {
            value: 0
        };

        this.reportState = function(send, done, original) {
            send = send || function() { this.send.apply(this,arguments) };
            done = done || function() { this.done.apply(this,arguments) };
            let msg = {
                topic: "device",
                payload: {
                    deviceId: this.device,
                    deviceType: "water",
                    name: this.name,
                    value: this.state.value,
                }
            };

            if(original !== undefined){
              original.payload = msg.payload;
              Object.assign(msg,original);
            }

            send(msg);
            done();
        }

        this.setState = function(value, send, done){
            Object.assign(this.state, value);
            this.reportState(send, done);
        };

        if(this.conf && this.device){
            const callback  = (evt) => {
                console.debug("WaterDevice("+this.name+") Callback called");
                console.debug(evt);
                if(evt["name"] == "water"){
                    this.setState({
                        value: evt["value"]
                    });
                }
            }

            this.conf.registerCallback(this, this.device, callback);

            this.conf.getDeviceStatus(this.device,"main/capabilities/waterSensor").then( (status) => {
                console.debug("WaterDevice("+this.name+") Status Refreshed");
                console.debug(status);

                this.setState({
                    value: status["water"]["value"],
                });

            }).catch( err => {
                console.error("Ops... error getting device state (WaterDevice)");
                console.error(err);
            });

            this.on('input', (msg, send, done) => {
                send = send || function() { this.send.apply(this,arguments) };
                done = done || function() { this.done.apply(this,arguments) };
                console.debug("Input Message Received");
                console.log(msg);

                if(msg && msg.topic !== undefined){
                    switch(msg.topic){
                        case "update":
                            this.reportState(send, done, msg);
                            break;

                        default:
                            done("Invalid topic");
                            break;
                    }
                } else {
                    done("Invalid message");
                }
            });

            this.on('close', () => {
                console.debug("Closed");
                this.conf.unregisterCallback(this, this.device, callback);
            });
        }
    }

    RED.nodes.registerType("smartthings-node-water", SmartthingsWaterNode);
};