# LogTrail - Syslog Viewer plugin for Kibana

Introduction
------------
LogTrail is a plugin for Kibana to view, analyze, search and tail syslog events in realtime with a developer/sysadmin friendly interface inspired by [Papertrail](https://papertrailapp.com/).

![Events](https://raw.githubusercontent.com/sivasamyk/logtrail/master/screenshot.png)

Features
--------
 - View, analyze and search syslog events from a centralized, developer and sysadmin friendly interface
 - Live tail
 - Filter aggregated logs by hosts and program
 - Quickly seek to logs based on time
 - Supports all logs shipped in syslog format

Installation
------------
- Prerequisites
 - Download and install Elasticsearch , Logstash and Kibana
 - Logtrail is supported and tested with Kibana 4.x [ support for 5.x coming soon! ]
- Install logtrail plugin (requires restart of Kibana after install)
 - Kibana 4.x : `./bin/kibana plugin -i logtrail -u https://github.com/sivasamyk/logtrail/releases/download/v4.x-0.1.0/logtrail-4.x-0.1.0.tar.gz`

Configuration
-------------
### For existing log data in elasticsearch
- If you have already setup logging infrastructure, you need map the events fields in ES to logtrail specific fields. This can by done by editing
`logtrail.json` file located inside`./installedPlugins/logtrail` directory. Edit the following fields:
	- default_index - Elasticsearch index where the syslog events are stored (default: logstash-*)
	- fields - This parameter should be edited to map the event fields in ES to logtrail fields
	  - timestamp - maps to @timestamp field inserted by logstash. This will be used for querying internally
	  - display_timestamp - the formatted timestamp displayed in the events view. Can be mapped to @timestamp
	  - hostname - hostname from where the events were received. Also used by hostname filter
	  - program - program that generated this event.
	  - message - actual event message. This field will be used by search.
 - Example:  If you event fields name are @timestamp, 	host, process, message the mapping should be
 ```"mapping" : {
        "timestamp" : "@timestamp",
        "display_timestamp" : "@timestamp",
        "hostname" : "host",
        "program": "process",
        "message": "message"
    }```
- Each line displayed in the events view is of format:
  `display_timestamp hostname program:message`
- Any changes in `logtrail.json` requires restart of Kibana

### Fresh setup
- Configure logtrail plugin: Following paramters can be configured from the `logtrail.json` file located inside `./installedPlugins/logtrail` directory
    - tail_interval_in_seconds - tail refresh interval (default: 10 seconds)
    - max_buckets -  max events fetched per request (default: 500)
    - default_index - Elasticsearch index where the syslog events are stored (default: logstash-*)
    - Any changes in `logtrail.json` requires restart of Kibana
- Configure logstash to receive syslog events
 - Start logstash agent with following configuration to recieve syslog events.
  ```
  input {
    tcp {
      port => 5000 # syslog port. can be changed
      type => syslog
    }
    udp { #optional. required if syslog events are sent using UDP.
      port => 5000
      type => syslog
    }
  }
  #Do not change the contents of filter codec
  filter {
    if [type] == "syslog" {
      grok {
        match => { "message" => "%{SYSLOGTIMESTAMP:syslog_timestamp} %{SYSLOGHOST:hostname} %{DATA:program}(?:\[%{POSINT:pid}\])?: %{GREEDYDATA:syslog_message}" }
        add_field => [ "received_at", "%{@timestamp}" ]
        add_field => [ "received_from", "%{host}" ]
      }
      date {
        match => [ "syslog_timestamp", "MMM  d HH:mm:ss", "MMM dd HH:mm:ss" ]
      }
    }
  }

  output {
    elasticsearch {
      hosts => ["localhost:9200"]  #change host as required
    }
  }
  ```
- Configure rsyslog to send data to logstash
  - In Ubuntu
	    - As root, edit /etc/rsyslog.conf or /etc/syslog.conf to include following line at the end
	      ```*.*                       @<logstash-agent-ip>:<port>
	      ```
	    - Restart rsyslog to activate the changes
	      ```sudo service rsyslog restart
	      ```
  - Logs & Events from Windows, Java, Python, PHP, Perl, Ruby, Android, Docker, .Net can be shipped using syslog protocol.
  - For more configuration options refer to [Papertrail Configuration Help](http://help.papertrailapp.com/).
- Switching back to Kibana main view from logtrail will not work (known bug). Workaround: Please change the URL directly in address bar.
