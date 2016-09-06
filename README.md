#LogTrail - Log Viewer plugin for Kibana

##Introduction
LogTrail is a plugin for Kibana to view, analyze, search and tail logs in realtime with a developer/sysadmin friendly interface inspired by [Papertrail](https://papertrailapp.com/).
##Features
 - View, analyze and search logs in a developer and sysadmin friendly interface
 - Live tail
 - Filter aggregated logs by hosts and program
 - Quickly seek to logs based on time
 - Supports all logs shipped in syslog format
##Setup
###Prerequisites
 - Download and install Elasticsearch , Logstash and Kibana
 - Logtrail is supported and tested with Kibana 4.5 and 5.0 versions
###Install logtrail plugin
To install logtrail plugin in your kibana instance execute
 - Kibana 4.5 : `./bin/kibana plugin -i logtail http...`
 - Kibana 5.0
###Configure rsyslog

###Configure logstash
###Customize logtrail plugin

##TODO
