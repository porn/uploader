dexcomDriver = function(config) {
    var serialDevice = config.deviceComms;

    var SYNC_BYTE = 0x01;

    var CMDS = {
        NULL: { value: 0, name: "NULL" },
        ACK: { value: 1, name: "ACK" },
        NAK: { value: 2, name: "NAK" },
        INVALID_COMMAND: { value: 3, name: "INVALID_COMMAND" },
        INVALID_PARAM: { value: 4, name: "INVALID_PARAM" },
        INCOMPLETE_PACKET_RECEIVED: { value: 5, name: "INCOMPLETE_PACKET_RECEIVED" },
        RECEIVER_ERROR: { value: 6, name: "RECEIVER_ERROR" },
        INVALID_MODE: { value: 7, name: "INVALID_MODE" },
        READ_FIRMWARE_HEADER: { value: 11, name: "Read Firmware Header" },
        READ_DATA_PAGE_RANGE: { value: 16, name: "Read Data Page Range" },
        READ_DATA_PAGES: { value: 17, name: "Read Data Pages" },
        READ_DATA_PAGE_HEADER: { value: 18, name: "Read Data Page Header" }
    };

    var RECORD_TYPES = {
        MANUFACTURING_DATA: { value: 0, name: "MANUFACTURING_DATA" },
        FIRMWARE_PARAMETER_DATA: { value: 1, name: "FIRMWARE_PARAMETER_DATA" },
        PC_SOFTWARE_PARAMETER: { value: 2, name: "PC_SOFTWARE_PARAMETER" },
        SENSOR_DATA: { value: 3, name: "SENSOR_DATA" },
        EGV_DATA: { value: 4, name: "EGV_DATA" },
        CAL_SET: { value: 5, name: "CAL_SET" },
        DEVIATION: { value: 6, name: "DEVIATION" },
        INSERTION_TIME: { value: 7, name: "INSERTION_TIME" },
        RECEIVER_LOG_DATA: { value: 8, name: "RECEIVER_LOG_DATA" },
        RECEIVER_ERROR_DATA: { value: 9, name: "RECEIVER_ERROR_DATA" },
        METER_DATA: { value: 10, name: "METER_DATA" },
        USER_EVENT_DATA: { value: 11, name: "USER_EVENT_DATA" },
        USER_SETTING_DATA: { value: 12, name: "USER_SETTING_DATA" },
        MAX_VALUE: { value: 13, name: "MAX_VALUE" }
    };

    var TRENDS = {
        NONE: { value: 0, name: "None" },
        DOUBLEUP: { value: 1, name: "DoubleUp" },
        SINGLEUP: { value: 2, name: "SingleUp" },
        FORTYFIVEUP: { value: 3, name: "FortyFiveUp" },
        FLAT: { value: 4, name: "Flat" },
        FORTYFIVEDOWN: { value: 5, name: "FortyFiveDown" },
        SINGLEDOWN: { value: 6, name: "SingleDown" },
        DOUBLEDOWN: { value: 7, name: "DoubleDown" },
        NOTCOMPUTABLE: { value: 8, name: "Not Computable" },
        RATEOUTOFRANGE: { value: 9, name: "Rate Out Of Range" }
    };

    var BASE_DATE = new Date(2009, 0, 1).valueOf();

    var getCmdName = function(idx) {
        for (var i in CMDS) {
            if (CMDS[i].value == idx) {
                return CMDS[i].name;
            }
        }
        return "UNKNOWN COMMAND!";
    };


    var getTrendName = function(idx) {
        for (var i in TRENDS) {
            if (TRENDS[i].value == idx) {
                return TRENDS[i].name;
            }
        }
        return "UNKNOWN TREND!";
    };

    var firmwareHeader = null;

    // builds a command in an ArrayBuffer
    // The first byte is always 0x01 (SYNC), 
    // the second and third bytes are a little-endian payload length.
    // then comes the payload, 
    // finally, it's followed with a 2-byte little-endian CRC of all the bytes
    // up to that point.
    // payload is any indexable array-like object that returns Numbers

    var buildPacket = function(command, payloadLength, payload) {
        var datalen = payloadLength + 6;
        var buf = new ArrayBuffer(datalen);
        var bytes = new Uint8Array(buf);
        var ctr = util.pack(bytes, 0, "bsb", SYNC_BYTE,
            datalen, command);
        ctr += util.copyBytes(bytes, ctr, payload, payloadLength);
        var crc = crcCalculator.calcDexcomCRC(bytes, ctr);
        util.pack(bytes, ctr, "s", crc);
        return buf;
    };


    var readFirmwareHeader = function() {
        return {
            packet: buildPacket(
                CMDS.READ_FIRMWARE_HEADER.value, 0, null
            ),
            parser: function(packet) {
                var data = parseXMLPayload(packet);
                firmwareHeader = data;
                return data;
            }
        };
    };


    var readDataPageRange = function(rectype) {
        return {
            packet: buildPacket(
                CMDS.READ_DATA_PAGE_RANGE.value, 
                1,
                [rectype.value]
            ),
            parser: function(result) {
                return util.unpack(result.payload, 0, "ii", ["lo", "hi"]);
                }
            };
    };


    var readDataPages = function(rectype, startPage, numPages) {
        var parser = function(result) {
            var format = "iibbiiiibb";
            var header = util.unpack(result.payload, 0, format, [
                    "index", "nrecs", "rectype", "revision", 
                    "pagenum", "r1", "r2", "r3", "j1", "j2"
                ]);
            return {
                header: header,
                data: parse_records(header, result.payload.subarray(util.structlen(format)))
            };
        };

        var parse_records = function(header, data) {
            var all = [];
            var ctr = 0;
            for (var i = 0; i<header.nrecs; ++i) {
                var format = "iisbs";
                var flen = util.structlen(format);
                var rec = util.unpack(data, ctr, format, [
                    "systemSeconds", "displaySeconds", "glucose", "trend", "crc"   
                ]);
                rec.glucose &= 0x3FF;
                rec.trend &= 0xF;
                rec.trendText = getTrendName(rec.trend);
                rec.systemTime = new Date(BASE_DATE + 1000*rec.systemSeconds);
                rec.displayTime = new Date(BASE_DATE + 1000*rec.displaySeconds);
                rec.data = data.subarray(ctr, ctr + flen);
                ctr += flen;
                all.push(rec);
            }
            return all;
        };

        var struct = "bib";
        var len = util.structlen(struct);
        var payload = new Uint8Array(len);
        util.pack(payload, 0, struct, rectype.value, startPage, numPages);

        return {
            packet: buildPacket(
                CMDS.READ_DATA_PAGES.value, len, payload
            ),
            parser: parser
        };
    };


    var readDataPageHeader = function() {
        return {
            packet: buildPacket(
                CMDS.READ_DATA_PAGE_HEADER.value, 0, null
            ),
            parser: null
        };
    };



    // accepts a stream of bytes and tries to find a dexcom packet
    // at the beginning of it.
    // returns a packet object; if valid == true it's a valid packet
    // if packet_len is nonzero, that much should be deleted from the stream
    // if valid is false and packet_len is nonzero, the previous packet 
    // should be NAKed.
    var extractPacket = function(bytestream) {
        var bytes = new Uint8Array(bytestream);
        var packet = { 
            bytes: bytes,
            valid: false, 
            packet_len: 0,
            command: 0,
            payload: null, 
            crc: 0
        };

        if (bytes[0] != SYNC_BYTE) {
            return packet;
        }

        var plen = bytes.length;
        var packet_len = util.extractShort(bytes, 1);
        // minimum packet len is 6
        if (packet_len > plen) {
            return packet;  // we're not done yet
        }

        // we now have enough length for a complete packet, so calc the CRC 
        packet.packet_len = packet_len;
        packet.crc = util.extractShort(bytes, packet_len - 2);
        var crc = crcCalculator.calcDexcomCRC(bytes, packet_len - 2);
        if (crc != packet.crc) {
            // if the crc is bad, we should discard the whole packet
            // (packet_len is nonzero)
            return packet;
        }

        // command is the fourth byte, packet is remainder of data
        packet.command = bytes[3];
        packet.payload = new Uint8Array(packet_len - 6);
        for (var i=0; i<packet_len - 6; ++i) {
            packet.payload[i] = bytes[i + 4];
        }

        packet.valid = true;
        return packet;
    };


    // Takes an xml-formatted string and returns an object
    var parseXML = function(s) {
        console.log(s);
        var result = {tag:"", attrs:{}};
        var tagpat = /<([A-Za-z]+)/;
        var m = s.match(tagpat);
        if (m) {
            result.tag = m[1];
        }
        var gattrpat = /([A-Za-z]+)='([^']+)'/g;
        var attrpat = /([A-Za-z]+)='([^']+)'/;
        m = s.match(gattrpat);
        for (var r in m) {
            var attr = m[r].match(attrpat);
            if (result.attrs[attr[1]]) {
                console.log("Duplicated attribute!");
            }
            result.attrs[attr[1]] = attr[2];
        }
        return result;
    };


    var parseXMLPayload = function(packet) {
        if (!packet.valid) {
            return {};
        }
        if (packet.command !== 1) {
            return {};
        }

        var len = packet.packet_len - 6;
        var data = null;
        if (len) {
            data = parseXML(
                util.extractString(packet.payload, 0, len));
        }
        return data;
    };

    // When you call this, it looks to see if a complete Dexcom packet has
    // arrived and it calls the callback with it and strips it from the buffer. 
    // It returns true if a packet was found, and false if not.
    var readDexcomPacket = function(packetcallback) {
        // for efficiency reasons, we're not going to bother to ask the driver
        // to decode things that can't possibly be a packet
        // first, discard bytes that can't start a packet
        var discardCount = 0;
        while (serialDevice.buffer.length > 0 && serialDevice.buffer[0] != SYNC_BYTE) {
            ++discardCount;
        }
        if (discardCount) {
            serialDevice.discardBytes(discardCount);
        }

        if (serialDevice.buffer.length < 6) { // all complete packets must be at least this long
            return false;       // not enough there yet
        }

        // there's enough there to try, anyway
        var packet = extractPacket(serialDevice.buffer);
        if (packet.packet_len !== 0) {
            // remove the now-processed packet
            serialDevice.discardBytes(packet.packet_len);
        }
        packetcallback(packet);
        return true;
    };

    // callback gets a result packet with parsed payload
    var dexcomCommandResponse = function(commandpacket, callback) {
        var processResult = function(result) {
            console.log(result);
            if (result.command != CMDS.ACK.value) {
                console.log("Bad result %d (%s) from data packet", 
                    result.command, getCmdName(result.command));
                console.log("Command packet was:");
                var bytes = new Uint8Array(commandpacket.packet);
                console.log(bytes);
                console.log("Result was:");
                console.log(result);
                callback("Bad result " + result.command + " (" + 
                    getCmdName(result.command) + ") from data packet", result);
            } else {
                // only attempt to parse the payload if it worked
                if (result.payload) {
                    result.parsed_payload = commandpacket.parser(result);
                }
                callback(null, result);
            }
        };

        var waitloop = function() {
            if (!readDexcomPacket(processResult)) {
                console.log(".");
                setTimeout(waitloop, 100);
            }
        };

        serialDevice.writeSerial(commandpacket.packet, function() {
            console.log("->");
            waitloop();
        });
    };

    var fetchOneEGVPage = function(pagenum, callback) {
        var cmd = readDataPages(
            RECORD_TYPES.EGV_DATA, pagenum, 1);
        dexcomCommandResponse(cmd, function(err, page) {
            console.log("page");
            console.log(page.parsed_payload);
            callback(err, page);
        });
    };

    var detectDexcom = function(obj, cb) {
        var cmd = readFirmwareHeader();
        dexcomCommandResponse(cmd, function(err, result) {
            if (err) {
                console.log("Failure trying to talk to dexcom.");
                console.log(err);
                console.log(result);
                cb(null, null);
            } else {
                cb(null, obj);
            }
        });
    };

    var downloadEGVPages = function(progress, callback) {
        var cmd = readDataPageRange(RECORD_TYPES.EGV_DATA);
        dexcomCommandResponse(cmd, function(err, pagerange) {
            if (err) {
                return callback(err, pagerange);
            }
            console.log("page range");
            var range = pagerange.parsed_payload;
            console.log(range);
            var pages = [];
            for (var pg = range.hi; pg >= range.lo; --pg) {
                pages.push(pg);
            }
            pages = pages.slice(0, 3);      // FOR DEBUGGING!
            var npages = 0;
            var fetch_and_progress = function(data, callback) {
                progress(npages++ * 100.0/pages.length);
                return fetchOneEGVPage(data, callback);
            };
            async.mapSeries(pages, fetch_and_progress, function(err, results) {
                if (err) {
                    console.log("error in dexcomCommandResponse");
                    console.log(err);
                }
                console.log(results);
                callback(err, results);
            });

        });
    };

    var processEGVPages = function(pagedata) {
        var readings = [];
        for (var i=0; i<pagedata.length; ++i) {
            var page = pagedata[i].parsed_payload;
            for (var j=0; j<page.data.length; ++j) {
                var reading = _.pick(page.data[j], "displaySeconds", "displayTime", "glucose",
                    "systemSeconds", "systemTime", "trend", "trendText");
                reading.pagenum = page.header.pagenum;
                readings.push(reading);
            }
        }
        return readings;
    };

/*
    var connectDexcom = function() {
        var cmd = readFirmwareHeader();
        dexcomCommandResponse(cmd, function(result) {
            console.log("firmware header");
            // var deviceInfo = result.parsed_payload.attrs;
            console.log(result);
            var cmd2 = readDataPageRange(RECORD_TYPES.EGV_DATA);
            dexcomCommandResponse(cmd2, function(pagerange) {
                console.log("page range");
                var range = pagerange.parsed_payload;
                console.log(range.hi, range.lo);
                var pages = [];
                for (var pg = range.hi; pg >= range.lo; --pg) {
                    console.log(pg);
                    pages.push(pg);
                }
                console.log(pages);
                async.mapSeries(pages, fetchOneEGVPage, function(err, results) {
                    console.log(results);
                    var sum = 0;
                    for (var i=0; i<results.length; ++i) {
                        sum += results[i];
                    }
                    var msg = sum + " new records uploaded.";
                    if (err == 'STOP') {
                        console.log(msg);
                    } else if (err) {
                        console.log("Error: ", err);
                    } else {
                        console.log(msg);
                    }
                });

            });
        });
    };
*/

    return {
        // should call the callback with null, obj if the item 
        // was detected, with null, null if not detected.
        // call err only if there's something unrecoverable.
        detect: function (obj, cb) {
            detectDexcom(obj, cb);
        },

        // this function starts the chain, so it has to create but not accept
        // the result (data) object; it's then passed down the rest of the chain
        setup: function (progress, cb) {
            progress(100);
            cb(null, { firmwareHeader: firmwareHeader });
        },

        connect: function (progress, data, cb) {
            progress(100);
            data.connect = true;
            cb(null, data);
        },

        getConfigInfo: function (progress, data, cb) {
            progress(100);
            data.getConfigInfo = true;
            cb(null, data);
        },

        fetchData: function (progress, data, cb) {
            progress(0);
            downloadEGVPages(progress, function (err, result) {
                data.egv_data = result;
                progress(100);
                cb(err, data);
            });
        },

        processData: function (progress, data, cb) {
            progress(0);
            data.cbg_data = processEGVPages(data.egv_data);
            progress(100);
            data.processData = true;
            cb(null, data);
        },

        uploadData: function (progress, data, cb) {
            progress(100);
            data.uploadData = true;
            cb(null, data);
        },

        disconnect: function (progress, data, cb) {
            progress(100);
            data.disconnect = true;
            cb(null, data);
        },

        cleanup: function (progress, data, cb) {
            progress(100);
            data.cleanup = true;
            cb(null, data);
        }
    };
};
