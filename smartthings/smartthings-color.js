var Promise = require('promise');

module.exports = function(RED) {

    function hslToRgb(h, s, l) {
      let r, g, b;

      if(s == 0) {
          r = g = b = l; // achromatic
      } else {
          var hue2rgb = function hue2rgb(p, q, t){
              if(t < 0) t += 1;
              if(t > 1) t -= 1;
              if(t < 1/6) return p + (q - p) * 6 * t;
              if(t < 1/2) return q;
              if(t < 2/3) return p + (q - p) * (2/3 - t) * 6;
              return p;
          }

          const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
          const p = 2 * l - q;
          r = hue2rgb(p, q, h + 1/3);
          g = hue2rgb(p, q, h);
          b = hue2rgb(p, q, h - 1/3);
      }
      return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
    }

    function SmartthingsColorNode(config) {
        RED.nodes.createNode(this, config);

        console.debug("SmartthingsLevelNode")
        console.debug(config);

        this.conf = RED.nodes.getNode(config.conf);
        this.name = config.name;
        this.device = config.device;

        this.state = {
            value: 0,
            level: 0,
            levelUnit: "",
            color: [0,0,0],
            hue: 0,
            saturation: 0
        }

        this.setState = function(value){
            Object.assign(this.state, value);

            let msg = [{
                topic: "switch",
                payload: {
                    deviceId: this.device,
                    name: this.name,
                    value: this.state.value
                }
            },{
                topic: "level",
                payload: {
                    deviceId: this.device,
                    name: this.name,
                    value: this.state.level,
                    unit: this.state.levelUnit
                }
            },{
                topic: "color",
                payload: {
                    deviceId: this.device,
                    name: this.name,
                    value: this.state.color,
                }
            }];

            this.send(msg);
        }

        if(this.conf && this.device){
            const callback  = (evt) => {
                console.debug("ColorDevice("+this.name+") Callback called");
                console.debug(evt);

                let state = {};

                switch(evt["name"].toLowerCase()){
                    case "switch":
                        state.value = (evt["value"].toLowerCase() === "on" ? 1 : 0);
                        break;

                    case "level":
                        state.level = evt["value"];
                        break;

                    case "color":
                        state.color = evt["value"];
                        break;
                }

                this.setState(state);
            }

            this.conf.registerCallback(this, this.device, callback);

            this.conf.getDeviceStatus(this.device,"main").then( (status) => {
                console.debug("ColorDevice("+this.name+") Status Refreshed");

                let state = {};

                if(status["switch"] !== undefined && status["switch"]["switch"] !== undefined){
                    state.value = (status["switch"]["switch"]["value"].toLowerCase() === "on" ? 1 : 0);
                }

                if(status["switchLevel"] !== undefined && status["switchLevel"]["level"] !== undefined){
                    state.level = status["switchLevel"]["level"]["value"];
                    state.levelUnit = status["switchLevel"]["level"]["unit"];
                    state.color = hslToRgb(state.hue, state.saturation, this.state.level);
                }

                if(status["colorControl"] !== undefined){
                    state.hue = status["colorControl"]["color"]["hue"];
                    state.saturation = status["colorControl"]["color"]["saturation"];
                    state.color = hslToRgb(state.hue, state.saturation, this.state.level);
                }
                this.setState(state);
            }).catch( err => {
                console.error("Ops... error getting device state (ColorDevice)");
                console.error(err);
            });

            this.on('input', msg => {
                console.debug("Input Message Received");
                console.log(msg);

                if(msg && msg.topic !== undefined){
                  switch(msg.topic){
                    case "switch":
                      this.conf.executeDeviceCommand(this.device,[{
                          component: "main",
                          capability: "switch",
                          command: (msg.payload.value == 1 ? "on" : "off")
                      }]).then( (ret) => {
                          const state = {
                            value: msg.payload.value
                          }
                          this.setState(state);
                      }).catch( (ret) => {
                          console.error("Error updating device");
                      });
                      break;

                    case "level":
                      this.conf.executeDeviceCommand(this.device,[{
                          component: "main",
                          capability: "switchLevel",
                          command: "setLevel",
                          arguments: [
                            msg.payload.value
                          ]
                      }]).then( (ret) => {
                          const state = {
                            level: msg.payload.value
                          }
                          this.setState(state);
                      }).catch( (ret) => {
                          console.error("Error updating device");
                      });
                      break;
                  }

                }
            });

            this.on('close', () => {
                console.debug("Closed");
                this.conf.unregisterCallback(this, this.device, callback);
            });
        }
    }

    RED.nodes.registerType("smartthings-node-color", SmartthingsColorNode);

};