// Init Vue

var vscode = null;
if("acquireVsCodeApi" in window) vscode = acquireVsCodeApi();

var connections = [];
var widgets = [];
var telemetries = {};
var commands = {};
var logs = [];
var telemBuffer = {};
var logBuffer = [];
var app = new Vue({
    el: '#app',
    data: {
        connections: connections,
        widgets: widgets,
        telemetries: telemetries,
        commands: commands,
        logs: logs,
        dataAvailable: false,
        cmdAvailable: false,
        logAvailable: false,
        telemRate: 0,
        logRate: 0,
        viewDuration: 0,
        leftPanelVisible: true,
        rightPanelVisible: true,
        textToSend: "",
        sendTextLineEnding: "\\r\\n",
        newChartDropZoneOver: false,
        newConnectionAddress: "",
        creatingConnection: false
    },
    methods: {
        updateStats: function(widget){
            widget.updateStats();
            //Vue.set(telem, "stats", computeStats(telem.data))
        },
        sendCmd: function(cmd) {
            socket.send(`|${cmd.name}|`);
        },
        onLogClick: function(log, index) {
            for(l of app.logs) l.selected = log.timestamp > 0 && l.timestamp == log.timestamp;
            logCursor.pub(log);
        },
        showLeftPanel: function(show) {
            app.leftPanelVisible=show;
            triggerChartResize();
        },
        showRightPanel: function(show) {
            app.rightPanelVisible=show;
            triggerChartResize();
        },
        clearAll: function() {
            logs.length = 0;
            Vue.set(app, 'logs', logs);
            logBuffer.length = 0;
            telemetries = {};
            Vue.set(app, 'telemetries', telemetries);
            commands = {};
            Vue.set(app, 'commands', commands);
            telemBuffer = {};
            widgets.length = 0;
            Vue.set(app, 'widgets', widgets);
            app.dataAvailable = false;
            app.cmdAvailable = false;
            app.logAvailable = false;
        },
        sendText: function(text) {
            let escape = app.sendTextLineEnding.replace("\\n","\n");
            escape = escape.replace("\\r","\r");
            vscode.postMessage({ cmd: "sendToSerial", text: text+escape});
        },
        onDragTelemetry: function(e, telemetryName){
            e.dataTransfer.dropEffect = 'copy'
            e.dataTransfer.effectAllowed = 'copy'
            e.dataTransfer.setData("telemetryName", telemetryName);
        },
        onDropInWidget: function(e, widget){            
            widget.draggedOver = false;
            let telemetryName = e.dataTransfer.getData("telemetryName");
            let newIsXY = app.telemetries[telemetryName].xy;
            let chartIsXY = (widget.series.length
                && widget.series[0].sourceNames.length
                && app.telemetries[widget.series[0].sourceNames[0]].xy
            );
            if(newIsXY != chartIsXY) return;
            let serie = new DataSerie(telemetryName);
            serie.sourceNames = [telemetryName];
            widget.addSerie(serie);
        },
        onWidgetDragOver: function(e, widget){
            e.preventDefault();
            widget.draggedOver = true;
        },
        onWidgetDragLeave: function(e, widget){
            e.preventDefault();
            widget.draggedOver = false;
        },
        showWidget: function(widget, show){
            widget.hidden = show;
            console.log(widget, show)
            triggerChartResize();
        },
        removeWidget: function(widget){
            let idx = widgets.findIndex((w)=>w.id==widget.id);
            if(idx>=0) app.widgets.splice(idx, 1);
            triggerChartResize();
        },
        onDropInNewChart: function(e){            
            newChartDropZoneOver = false;
            let telemetryName = e.dataTransfer.getData("telemetryName");
            let chart = new ChartWidget(!!app.telemetries[telemetryName].xy);
            let serie = new DataSerie(telemetryName);
            serie.sourceNames = [telemetryName];
            chart.addSerie(serie);
            widgets.unshift(chart); // prepend chart
        },
        onNewChartDragOver: function(e){
            e.preventDefault();
            newChartDropZoneOver = true;
        },
        onNewChartDragLeave: function(e){
            e.preventDefault();
            newChartDropZoneOver = false;
        },
        createConnection: function(){
            let conn = new ConnectionTeleplotWebsocket();
            let addr = app.newConnectionAddress;
            let port = 8080;
            if(addr.includes(":")) {
                port = parseInt(addr.split(":")[1]);
                addr = addr.split(":")[0];
            }
            conn.connect(addr, port);
            app.connections.push(conn);
            app.creatingConnection = false;
            app.newConnectionAddress = "";
        },
        removeConnection: function(conn){
            for(let i=0;i<app.connections.length;i++){
                if(app.connections[i] == conn) {
                    app.connections[i].disconnect();
                    app.connections.splice(i,1);
                    break;
                }
            }
        }
    }
})
function rgba(r,g,b,a){
    return {r,g,b,a, toString: function(){ return `rgba(${this.r},${this.g},${this.b},${this.a})`}};
}
var ColorPalette = {
    colors: [
        rgba(231, 76, 60,1.0), //red
        rgba(52, 152, 219,1.0), //blue
        rgba(46, 204, 113,1.0), //green
        rgba(155, 89, 182,1.0), //violet
        rgba(241, 196, 15,1.0), //yellow
        rgba(26, 188, 156,1.0), //turquoise
        rgba(230, 126, 34,1.0), //orange
        rgba(52, 73, 94,1.0), //blueish grey
        rgba(127, 140, 141,1.0), //gray
        rgba(192, 57, 43,1.0), //dark red
        rgba(41, 128, 185,1.0), //darkblue
        rgba(39, 174, 96,1.0), //darkgreen
        rgba(142, 68, 173,1.0), // darkviolet
        rgba(211, 84, 0,1.0), //darkorange
        rgba(44, 62, 80,1.0), //blueish darkgrey
        rgba(0, 0, 0,1.0), //black
    ],
    getColor: function(index, alpha=1.0){
        let color = Object.assign({}, this.colors[index % this.colors.length]);
        color.a = alpha;
        return color;
    }
}

//Init refresh rate
setInterval(updateView, 60); // 15fps

logCursor = {
    cursor:{
        show: true,
        sync:{
            values:[0,0],
            scales:["x"],
            key: "cursorSync",
            filters: {pub: function(...e){return true}, sub: function(...e){return true}},
            match: [function(a,b){return a==b}],
            setSeries: true,
        },
        left: 10,
        top: 10,
        x: true,
        y: false
    },
    scales: {
        x:{ori:0, _max: 1, _min: 1, key:"x", time:true},
    },
    clientX: -10,
    clientY: -10,
    pub: function(log) {
        logCursor.cursor.sync.values[0] = log.timestamp/1000;
        logCursor.cursor.sync.values[1] = 0;
        window.cursorSync.pub("mousemove", logCursor, 0, 0, 0, 0, -42);
    }
};

// Init cursor sync
var timestampWindow = {min:0, max:0};
window.cursorSync = uPlot.sync("cursorSync");
window.cursorSync.sub({ pub:function(type, self, x, y, w, h, i){
    if(type=="mousemove"){
        if(i != -42){
            let timestamp = self.cursor.sync.values[0];
            for(l of app.logs) l.selected = Math.abs(l.timestamp/1000 - timestamp) < 0.1; // within 10ms difference (20ms window)
        }
        if(i != null) updateDisplayedVarValues(self.cursor.sync.values[0], self.cursor.sync.values[1]);
        else resetDisplayedVarValues();
    }
    // let some time to update the axes min/max
    setTimeout(()=>{
        timestampWindow.min = self.scales.x._min;
        timestampWindow.max = self.scales.x._max;
    }, 10);
    return true;
}});

var defaultPlotOpts = {
    title: "",
    width: 400,
    height: 250,
    //hooks: {setCursor: [function(e){console.log(e);}]},
    scales: {
        x: {
            time: true
        },
        y:{}
    },
    series: [
        {},
        {
            stroke: "red",
            fill: "rgba(255,0,0,0.1)"
        }
    ],
    cursor: {
        lock: false,
        focus: { prox: 16, },
        sync: {
            key: window.cursorSync.key,
            setSeries: true
        }
    },
    legend: {
        show: false
    }
};

const drawXYPoints = (u, seriesIdx, idx0, idx1) => {
    const size = 5 * devicePixelRatio;
    uPlot.orient(u, seriesIdx, (series, dataX, dataY, scaleX, scaleY, valToPosX, valToPosY, xOff, yOff, xDim, yDim, moveTo, lineTo, rect, arc) => {
        let d = u.data[seriesIdx];
        u.ctx.fillStyle = series.stroke();
        let deg360 = 2 * Math.PI;
        let p = new Path2D();
        for (let i = 0; i < d[0].length; i++) {
            let xVal = d[0][i];
            let yVal = d[1][i];
            if (xVal >= scaleX.min && xVal <= scaleX.max && yVal >= scaleY.min && yVal <= scaleY.max) {
                let cx = valToPosX(xVal, scaleX, xDim, xOff);
                let cy = valToPosY(yVal, scaleY, yDim, yOff);
                p.moveTo(cx + size/2, cy);
                arc(p, cx, cy, size/2, 0, deg360);
            }
        }
        u.ctx.fill(p);
    });
    return null;
};

var ConnectionCount = 0;
class Connection{
    constructor(){
        this.name = "";
        this.id = "connection-"+ConnectionCount++;
        this.type = "";
        this.connected = false;
        this.inputs = [];
    }

    connect(){

    }

    removeInput(input){
        for(let i=0;i<this.inputs.length;i++){
            if(this.inputs[i] == input) {
                this.inputs[i].disconnect();
                this.inputs.splice(i,1);
                break;
            }
        }
    }
}

class ConnectionTeleplotVSCode extends Connection{
    constructor() {
        super();
        this.name="localhost-VSCode"
        this.type = "teleplot-vscode";
        this.vscode = vscode;
        this.udp = new DataInputUDP(this, "UDP");
        this.udp.address = "localhost";
        this.udp.port = 47269;
        this.inputs.push(this.udp);
        
        this.supportSerial = true;
        let serialIn = new DataInputSerial(this, "Serial");
        this.inputs.push(serialIn);
    }

    connect() {
        if(!this.vscode) return false;
        window.addEventListener('message', message => {
            let msg = message.data;
            if("id" in msg){
                for(let input of this.inputs){
                    if(input.id == msg.id){
                        input.onMessage(msg);
                        break;
                    }
                }
            }
            else{
                if("data" in msg) {
                    parseData(msg); //update server so it keeps track of connection IDs when forwarding data
                }
                else if("cmd" in msg) {
                    //nope
                }
            }
        });
        this.vscode.postMessage({ cmd: "listSerialPorts"});
        //Report UDP input as connected
        this.udp.connected = true;
        this.connected = true;
        return true;
    }

    disconnect() {
        for(let input of this.inputs){
            input.disconnect();
        }
        this.connected = false;
    }

    sendServerCommand(command) {
        this.vscode.postMessage(command);
    }

    updateCMDList() {
        for(let input of this.inputs){
            input.updateCMDList();
        }
    }

    createInput(type) {
        if(type=="serial") {
            let serialIn = new DataInputSerial(this, "Serial");
            this.inputs.push(serialIn);
        }
    }
}

class ConnectionTeleplotWebsocket extends Connection{
    constructor(){
        super();
        this.name=""
        this.type = "teleplot-websocket";
        this.inputs = [];
        this.socket = null;
        this.address = "";
        this.port = "";
        this.udp = new DataInputUDP(this, "UDP");
        this.udp.address = "";
        this.udp.port = 47269;
        this.inputs.push(this.udp);
    }

    connect(_address, _port){
        this.name = _address+":"+_port;
        this.address = _address;
        this.port = _port;
        this.udp.address = this.address;
        this.socket = new WebSocket("ws://"+this.address+":"+this.port);
        this.socket.onopen = (event) => {
            this.udp.connected = true;
            this.connected = true;
            this.sendServerCommand({ cmd: "listSerialPorts"});
        };
        this.socket.onclose = (event) => {
            this.udp.connected = false;
            this.connected = false;
            for(let input of this.inputs){
                input.disconnect();
            }
        };
        this.socket.onmessage = (msgWS) => {
            let msg = JSON.parse(msgWS.data);
            if("id" in msg){
                for(let input of this.inputs){
                    if(input.id == msg.id){
                        input.onMessage(msg);
                        break;
                    }
                }
            }
            else{
                this.udp.onMessage(msg);
            }
        };
        return true;
    }

    disconnect(){
        if(this.socket){
            this.socket.close();
            this.socket = null;
        }
    }

    sendServerCommand(command){
        if(this.socket)
            this.socket.send(JSON.stringify(command));
    }

    updateCMDList(){
        for(let input of this.inputs){
            input.updateCMDList();
        }
    }

    createInput(type) {
        if(type=="serial") {
            let serialIn = new DataInputSerial(this, "Serial");
            this.inputs.push(serialIn);
        }
    }
}

var DataInputCount = 0;
class DataInput{
    constructor(_connection, _name){
        this.connection = _connection;
        this.name = _name;
        this.id = "data-input-"+DataInputCount++;
        this.type = "";
        this.connected = false;
    }
}

class DataInputUDP extends DataInput{
    constructor(_connection, _name) {
        super(_connection, _name);
        this.type = "UDP";
        this.address = "";
        this.port = 47269;
    }

    connect(){}
    disconnect(){}

    onMessage(msg){
        if("data" in msg) {
            msg.input = this;
            parseData(msg);
        }
        else if("cmd" in msg) {
            //nope
        }
    }

    updateCMDList(){
        this.connection.sendServerCommand({ id: this.id, data: `|_telecmd_list_cmd|`});
    }
}

class DataInputSerial extends DataInput{
    constructor(_connection, _name) {
        super(_connection, _name);
        this.port = null;
        this.baudrate = 115200;
        this.type = "serial";
        this.portList = [];
        this.listPorts();
        this.textToSend = "";
        this.endlineToSend = "";
    }

    connect(){
        let baud = parseInt(this.baudrate);
        this.connection.sendServerCommand({ id: this.id, cmd: "connectSerialPort", port: this.port, baud: baud})
    }

    disconnect(){
        this.connection.sendServerCommand({ id: this.id, cmd: "disconnectSerialPort"})
    }

    onMessage(msg){
        if("data" in msg) {
            msg.input = this;
            parseData(msg);
        }
        else if("cmd" in msg) {
            if(msg.cmd == "serialPortList"){
                this.portList.length = 0;
                for(let serial of msg.list){
                    if( serial.locationId
                     || serial.serialNumber
                     || serial.pnpId
                     || serial.vendorId
                     || serial.productId ){
                        this.portList.push(serial);
                    }
                }
            }
            else if(msg.cmd == "serialPortConnect"){
                this.connected = true;
            }
            else if(msg.cmd == "serialPortDisconnect"){
                this.connected = false;
            }
        }
    }

    listPorts(){
        this.connection.sendServerCommand({ id: this.id, cmd: "listSerialPorts"});
    }

    updateCMDList(){
        //nope
    }

    sendText(text, lineEndings) {
        let escape = lineEndings.replace("\\n","\n");
        escape = escape.replace("\\r","\r");
        this.connection.sendServerCommand({ id: this.id, cmd: "sendToSerial", text: text+escape});
    }
}

var DataSerieIdCount = 0;
class DataSerie{
    constructor(_name){
        this.name = _name;
        this.sourceNames = [];
        this.formula = "";
        this.initialized = false;
        this.data = [[],[]];
        this.pendingData = [[],[]];
        this.options = {};
        this.value = null;
        this.id = "data-serie-" + DataSerieIdCount++;
        this.stats = null;
    }

    update(){
        // no formula, simple data reference
        if(this.formula=="" && this.sourceNames.length==1){
            this.data[0] = app.telemetries[this.sourceNames[0]].data[0];
            this.data[1] = app.telemetries[this.sourceNames[0]].data[1];
            this.pendingData[0] = app.telemetries[this.sourceNames[0]].pendingData[0];
            this.pendingData[1] = app.telemetries[this.sourceNames[0]].pendingData[1];
            this.value = app.telemetries[this.sourceNames[0]].value;
        }
    }

    updateStats(){
        this.stats = computeStats(this.data);
    }
}

var DataWidgetIdCount = 0;
class DataWidget{
    constructor() {
        this.series = []; // DataSerie
        this.type = "chart";
        this.id = "widget-chart-" + DataWidgetIdCount++;
        this.gridPos = {h:3, w:3, x:0, y:0};   
    }

    isUsingSource(name){
        for(let s of this.series)
            if(s.sourceNames.includes(name)) return true;
        return false;
    }

    _getSourceList(){
        let sourceList = {};
        for(let s of this.series)
            for(let n of s.sourceNames)
                sourceList[n] = app.telemetries[n];
        return sourceList;
    }

    updateStats(){
        for(let s of this.series)
            s.updateStats();
    }
}

class ChartWidget extends DataWidget{
    constructor(_isXY=false) {
        super();
        this.isXY = _isXY;
        this.data = [[]];
        this.options = {
            title: "",
            width: 400,
            height: 250,
            scales: { x: {  time: true }, y:{} },
            series: [ {} ],
            focus: { alpha: 1.0, },
            cursor: {
                lock: false,
                focus: { prox: 16, },
                sync: {  key: window.cursorSync.key,  setSeries: true }
            },
            legend: { show: false }
        }
        if(this.isXY) {
            this.data[0] = null;
            this.options.mode = 2;
            delete this.options.cursor;
            this.options.scales.x.time = false;
        }
        this.forceUpdate = true;
    }

    addSerie(_serie){
        _serie.options._serie = _serie.name;
        _serie.options.stroke = ColorPalette.getColor(this.series.length).toString();
        _serie.options.fill = ColorPalette.getColor(this.series.length, 0.1).toString();
        if(this.isXY) _serie.options.paths = drawXYPoints;
        this.options.series.push(_serie.options);
        _serie.dataIdx = this.data.length;
        this.series.push(_serie);
        this.forceUpdate = true;
    }

    update(){
        // Update each series
        for(let s of this.series) s.update();
        if(this.isXY){
            if(this.forceUpdate) {
                this.data.length = 0;
                this.data.push(null);
                for(let s of this.series){
                    s.dataIdx = this.data.length;
                    this.data.push(s.data);
                }
                this.id += "-" //dummy way to force update
                triggerChartResize();
                this.forceUpdate = false;
            }
            else {
                for(let s of this.series) {
                    if(s.pendingData[0].length==0) continue;
                    for(let i=0;i<this.data[s.dataIdx].length;i++){
                        this.data[s.dataIdx][i].push(...s.pendingData[i]);
                    }
                }
            }
        }
        else if(this.data[0].length==0 || this.forceUpdate) {
            //Create data with common x axis
            let dataList = [];
            for(let s of this.series) dataList.push(s.data);
            this.data.length = 0;
            this.data = uPlot.join(dataList)
            this.id += "-" //dummy way to force update
            triggerChartResize();
            this.forceUpdate = false;
        }
        else {
            //Iterate on all series, adding timestamps and values
            let dataList = [];
            for(let s of this.series) dataList.push(s.pendingData);
            let pending = uPlot.join(dataList);
            if(pending[0].length){
                for(let i=0;i<pending.length;i++){
                    this.data[i].push(...pending[i]);
                }
            }
        }        
        //Clear older data from viewDuration
        if(!this.isXY && parseFloat(app.viewDuration)>0)
        {
            let latestTimestamp = this.data[0][this.data[0].length-1];
            let minTimestamp = latestTimestamp - parseFloat(app.viewDuration);
            let minIdx = findClosestLowerByIdx(this.data[0], minTimestamp);
            if(this.data[0][minIdx]<minTimestamp)
            {
                minIdx += 1;
                for(let i=0;i<this.data.length;i++){
                    this.data[i].splice(0, minIdx);
                }
            }
        }
    }
}

function parseData(msgIn){
    let now = new Date().getTime();
    let fromSerial = msgIn.fromSerial || (msgIn.input && msgIn.input.type=="serial");
    if(fromSerial) now = msgIn.timestamp;
    //parse msg
    let msgList = (""+msgIn.data).split("\n");
    for(let msg of msgList){
        try{
            // Inverted logic on serial port for usability
            if(fromSerial && msg.startsWith(">")) msg = msg.substring(1);// remove '>' to consider as variable
            else if(fromSerial && !msg.startsWith(">")) msg = ">:"+msg;// add '>' to consider as log

            // Command
            if(msg.startsWith("|")){
                // Parse command list
                let cmdList = msg.split("|");
                for(let cmd of cmdList){
                    if(cmd.length==0) continue;
                    if(app.commands[cmd] == undefined){
                        let newCmd = {
                            name: cmd
                        };
                        Vue.set(app.commands, cmd, newCmd);
                    }
                }
                if(!app.cmdAvailable && Object.entries(app.commands).length>0) app.cmdAvailable = true;
            }
            // Log
            else if(msg.startsWith(">")){
                let currLog = {
                    timestamp: now,
                    text: ""
                }
                
                let logStart = msg.indexOf(":")+1;
                currLog.text = msg.substr(logStart);
                currLog.timestamp = parseFloat(msg.substr(1, logStart-2));
                if(isNaN(currLog.timestamp) || !isFinite(currLog.timestamp)) currLog.timestamp = now;
                logBuffer.unshift(currLog);//prepend log to buffer
            }
            // Data
            else {
                // Extract series
                if(!msg.includes(':')) return;
                let startIdx = msg.indexOf(':');
                let name = msg.substr(0,msg.indexOf(':'));
                let endIdx = msg.indexOf('|');
                let flags = msg.substr(endIdx+1);
                if(endIdx == -1){
                    flags = "g";
                    endIdx = msg.length;
                }
                // Extract values array
                let values = msg.substr(startIdx+1, endIdx-startIdx-1).split(';')
                let xArray = [];
                let yArray = [];
                for(let value of values){
                    if(value.length==0) continue;
                    let sepIdx = value.indexOf(':');
                    if(sepIdx==-1){
                        xArray.push(now);
                        yArray.push(parseFloat(value));
                    }
                    else {
                        xArray.push(parseFloat(value.substr(0, sepIdx)));
                        yArray.push(parseFloat(value.substr(sepIdx+1)));
                    }
                }
                if(xArray.length>0){
                    appendData(name, xArray, yArray, flags)
                }
            }
        }
        catch(e){console.log(e)}
    }
}

function appendData(key, valuesX, valuesY, flags) {
    if(key.substring(0, 6) === "statsd") return;
    let isTimeBased = !flags.includes("xy");
    let shouldPlot = !flags.includes("np");
    if(app.telemetries[key] == undefined){
        let config = Object.assign({}, defaultPlotOpts);
        config.name = key;
        config.scales.x.time = isTimeBased;
        if(!isTimeBased){
            config.mode = 2;
            config.cursor.sync = undefined;
            config.series[1].paths = drawXYPoints;
        }
        var obj = {
            name: key,
            flags: flags,
            data: [[],[]],
            pendingData: [[],[]],
            value: 0,
            config: config,
            xy: !isTimeBased
        };
        Vue.set(app.telemetries, key, obj)
        // Create widget
        if(shouldPlot){
            let chart = new ChartWidget(!isTimeBased);
            let serie = new DataSerie(key);
            serie.sourceNames = [key];
            chart.addSerie(serie);
            widgets.push(chart);
        }
    }
    if(telemBuffer[key] == undefined){
        telemBuffer[key] = {data:[[],[]], value:0};
    }
    if(isTimeBased) valuesX.forEach((elem, idx, arr)=>arr[idx] = elem/1000); // convert timestamps to seconds

    // Flush data into buffer (to be flushed by updateView)
    telemBuffer[key].data[0].push(...valuesX);
    telemBuffer[key].data[1].push(...valuesY);
    telemBuffer[key].value = valuesY[valuesY.length-1];
    if(app.telemetries[key].xy) {
        telemBuffer[key].value = ""+valuesX[valuesX.length-1].toFixed(4)+" "+valuesY[valuesY.length-1].toFixed(4)+"";
    }
    return;
}

var lastUpdateViewTimestamp = 0;
function updateView() {
    // Clear Telemetries pendingData
    for(let key in app.telemetries) {
        app.telemetries[key].pendingData[0].length = 0;
        app.telemetries[key].pendingData[1].length = 0;
    }
    // Flush buffer into app model
    // Telemetry
    let dataSum = 0;
    for(let key in telemBuffer) {
        if(telemBuffer[key].data[0].length == 0) continue; // nothing to flush
        dataSum += telemBuffer[key].data[0].length;
        app.telemetries[key].data[0].push(...telemBuffer[key].data[0]);
        app.telemetries[key].data[1].push(...telemBuffer[key].data[1]);
        app.telemetries[key].pendingData[0].push(...telemBuffer[key].data[0]);
        app.telemetries[key].pendingData[1].push(...telemBuffer[key].data[1]);
        app.telemetries[key].value = telemBuffer[key].value;
        telemBuffer[key].data[0].length = 0;
        telemBuffer[key].data[1].length = 0;
    }
    //Clear older data from viewDuration
    if(parseFloat(app.viewDuration)>0)
    {
        for(let key in app.telemetries) {
            let data = app.telemetries[key].data;
            let latestTimestamp = data[0][data[0].length-1];
            let minTimestamp = latestTimestamp - parseFloat(app.viewDuration);
            let minIdx = findClosestLowerByIdx(data[0], minTimestamp);
            if(data[0][minIdx]<minTimestamp) minIdx += 1;
            else continue;
            app.telemetries[key].data[0].splice(0, minIdx);
            app.telemetries[key].data[1].splice(0, minIdx);
        }
    }
    // Update widgets
    for(let w of widgets){
        w.update();
    }

    if(!app.dataAvailable && Object.entries(app.telemetries).length>0) app.dataAvailable = true;

    // Logs
    var logSum = logBuffer.length;
    if(logBuffer.length>0) {
        app.logs.unshift(...logBuffer);//prepend log to list
        logBuffer.length = 0;
    }
    if(!app.logAvailable && app.logs.length>0) app.logAvailable = true;

    // Stats
    let now = new Date().getTime();
    if(lastUpdateViewTimestamp==0) lastUpdateViewTimestamp = now;
    let diff = now - lastUpdateViewTimestamp
    if(diff>0){
        app.telemRate = app.telemRate*0.8 + (1000/diff*dataSum)*0.2;
        app.logRate = app.logRate *0.8 + (1000/diff*logSum)*0.2;
    }
    lastUpdateViewTimestamp = now;
}

function exportSessionJSON() {
    let content = JSON.stringify({
        telemetries: app.telemetries,
        logs: app.logs,
        dataAvailable: app.dataAvailable,
        logAvailable: app.logAvailable
    });
    let now = new Date();
    let filename = `teleplot_${now.getFullYear()}-${now.getMonth()}-${now.getDate()}_${now.getHours()}-${now.getMinutes()}.json`;
    saveFile(content, filename);
}

function exportSessionCSV() {

    let csv = "timestamp(ms),";
    let dataList = [];
    for(let key in app.telemetries) {
        csv += key+",";
        dataList.push(app.telemetries[key].data);
    }
    csv += "\n";
    let joinedData = uPlot.join(dataList);

    for(let i=0;i<joinedData[0].length;i++) {
        for(let j=0;j<joinedData.length;j++) {
            let value = joinedData[j][i];
            if(isFinite(value) && !isNaN(value))
                csv += '"'+(""+joinedData[j][i]).replace('.',',')+'"';
            csv += ","
        }
        csv += "\n";
    }
    let now = new Date();
    let filename = `teleplot_${now.getFullYear()}-${now.getMonth()}-${now.getDate()}_${now.getHours()}-${now.getMinutes()}.csv`;
    saveFile(csv, filename);
}

function saveFile(content, filename) {
    if(vscode){
        vscode.postMessage({ cmd: "saveFile", file: {
            name: filename,
            content: content
        }});
    }
    else {
        var element = document.createElement('a');
        element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(content));
        element.setAttribute('download', filename);
        element.style.display = 'none';
        document.body.appendChild(element);
        element.click();
        document.body.removeChild(element);
    }
}

function importSessionJSON(event) {
    var file = event.target.files[0];
    if (!file) {
        return;
    }
    var reader = new FileReader();
    reader.onload = function(e) {
        try{
            let content = JSON.parse(e.target.result);
            for(let key in content.telemetries){
                // Add pendingData field if missing
                if(!("pendingData" in content.telemetries[key])){
                    content.telemetries[key].pendingData = [[],[]];
                }
            }
            for(let key in content) {
                Vue.set(app, key, content[key]);
            }
            // Trigger a resize event after initial chart display
                triggerChartResize();
        }
        catch(e) {
            alert("Importation failed: "+e.toString());
        }
    };
    reader.readAsText(file);
}

var chartResizeTimeout = null;
function triggerChartResize(){
    if(chartResizeTimeout) clearTimeout(chartResizeTimeout);
    chartResizeTimeout = setTimeout(()=>{
        window.dispatchEvent(new Event('resize'));
    }, 100);
}

function computeStats(data) {
    let stats = {
        min:0,
        max:0,
        sum:0,
        mean:0,
        med:0,
        stdev:0,
    };
    let values = data[1];
    //Find min/max indexes from timestampWindow
    let minIdx = 0, maxIdx = data[1].length;
    if(timestampWindow.min !=0 && timestampWindow.max != 0)
    {
        minIdx = findClosestLowerByIdx(data[0], timestampWindow.min) + 1;
        maxIdx = findClosestLowerByIdx(data[0], timestampWindow.max);
        if(maxIdx<=minIdx || maxIdx>=data[0].length) return stats;
        values = data[1].slice(minIdx, maxIdx);
    }
    if(values.length==0) return stats;
    // Sort
    let arr = values.slice().sort(function(a, b){return a - b;});
    for(let i=0;i<arr.length;i++) {
        if(!isFinite(arr[i]) || isNaN(arr[i])) {
            arr.splice(i,1);
            i--;
        }
    }
    if(arr.length==0) return stats;
    // Min, Max
    stats.min = arr[0];
    stats.max = arr[arr.length-1];
    // Sum, Mean
    for(let i=0;i<arr.length;i++) {
        stats.sum += arr[i];
    }
    stats.mean = stats.sum / arr.length;
    // Stdev
    let stdevSum=0;
    for(let i=0;i<arr.length;i++) {
        stdevSum += (arr[i] - stats.mean) * (arr[i] - stats.mean);
    }
    stats.stdev = Math.sqrt(stdevSum/arr.length);
    // Median (only one that requires the costly sort)
    var midSize = arr.length / 2;
	stats.med = midSize % 1 ? arr[midSize - 0.5] : (arr[midSize - 1] + arr[midSize]) / 2;
    return stats;
}

function findClosestLowerByIdx(arr, n) {
    let from = 0,
        to = arr.length - 1,
        idx;
  
    while (from <= to) {
        idx = Math.floor((from + to) / 2);
  
        let isLowerLast = arr[idx] <= n && idx == arr.length-1;
        let isClosestLower = (idx+1 < arr.length-1) && (arr[idx] <= n) && (arr[idx+1] > n);
        if (isClosestLower || isLowerLast) {
            return idx;
        }
        else {
            if (arr[idx] > n)  to = idx - 1;
            else  from = idx + 1;
        }
    }
    return 0;
}

  function resetDisplayedVarValues(){
    //for each telem, set latest value
    let telemList = Object.keys(app.telemetries);
    for(let telemName of telemList) {
        let telem = app.telemetries[telemName];
        if(telem.xy) continue;
        let idx = telem.data[0].length-1;
        if(0 <= idx && idx < telem.data[0].length) {
            telem.value = telem.data[1][idx];
        }
    }
}
function updateDisplayedVarValues(valueX, valueY){
    //for each telem, find closest value (before valueX and valueY)
    let telemList = Object.keys(app.telemetries);
    for(let telemName of telemList) {
        let telem = app.telemetries[telemName];
        if(telem.xy) continue;
        let idx = findClosestLowerByIdx(telem.data[0], valueX);
        if(idx < telem.data[0].length) {
            telem.value = telem.data[1][idx];
        }
    }
}

if(vscode){
    let conn = new ConnectionTeleplotVSCode();
    conn.connect();
    app.connections.push(conn);
}

setInterval(()=>{
    for(let conn of app.connections){
        conn.updateCMDList();
    }
}, 3000);
