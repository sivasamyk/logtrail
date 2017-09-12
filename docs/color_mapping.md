## Coloring messages ##

Logtrail provides option to color the messages based on field values. This feature can be enabled by configuring `color_mapping` field in `logtrail.json`. Let us assume you have following log messages:
```
2016-07-06 22:17:28,705 ERROR: org.graylog2.bootstrap.CmdLineTool - Couldn't load configuration: Properties file /etc/graylog/server/server.conf doesn't exist!
2016-07-06 22:18:14,268 INFO : org.graylog2.bootstrap.CmdLineTool - Loaded plugin: Collector 1.0.3 [org.graylog.plugins.collector.CollectorPlugin]
2016-07-10 17:37:28,541 WARN : org.graylog.plugins.map.geoip.GeoIpResolverEngine - GeoIP database file does not exist: /tmp/GeoLite2-City.mmdb
2016-07-10 17:37:29,302 INFO : org.graylog2.bootstrap.ServerBootstrap - JRE: Oracle Corporation 1.8.0_77 on Linux 3.16.0-30-generic
2016-07-06 22:18:18,219 DEBUG : org.mongodb.driver.cluster - Cluster created with settings {hosts=[localhost:27017], mode=SINGLE, requiredClusterType=UNKNOWN, serverSelectionTimeout='30000 ms', maxWaitQueueSize=5000}
```

Assuming the log level ( ERROR, WARN, INFO, DEBUG, TRACE ) is mapped to field `log_level` in Elasticsearch , following configuration in `logtrail.json` will color the messages:

```json
"color_mapping": {
      "field": "log_level",
      "mapping": {
        "ERROR": "#FF0000",
        "WARN": "#FFEF96",
        "DEBUG": "#B5E7A0",
        "TRACE": "#CFE0E8"
      }
    }
```

If there are no matches in the mapping, the default color ( as per CSS ) will be applied.

For the above configuration the event console display will be like:

![Color Coding screenshot](https://raw.githubusercontent.com/sivasamyk/logtrail/master/docs/color_mapping.png)
