#### 1. Hostname field need to be of type keyword

Logtrail uses aggregate query to fetch list of hosts. Aggregation requires the hostname field to be of type keyword.

If the index pattern starts with `logstash-*`, by default logstash will manage the templates. Default logstash template adds `.keyword` fields. When the index pattern is different, logstash does not manage the template. When not using `logstash-*` pattern, you can specify the template using `template` field in elastic output. 

You can download and reuse default logstash templates from following location. Make sure to change the `template` key in below json files to match the index pattern.

Elasticsearch 6.x : [https://github.com/logstash-plugins/logstash-output-elasticsearch/blob/master/lib/logstash/outputs/elasticsearch/elasticsearch-template-es6x.json](https://github.com/logstash-plugins/logstash-output-elasticsearch/blob/master/lib/logstash/outputs/elasticsearch/elasticsearch-template-es6x.json)

Elasticsearch 5.x : [https://github.com/logstash-plugins/logstash-output-elasticsearch/blob/master/lib/logstash/outputs/elasticsearch/elasticsearch-template-es5x.json](https://github.com/logstash-plugins/logstash-output-elasticsearch/blob/master/lib/logstash/outputs/elasticsearch/elasticsearch-template-es5x.json)

```ruby
	elasticsearch {
		index => "<index-pattern>"
		template => "elasticsearch-template-es6x.json"
	}
```

Filebeat template makes beat.hostname field type as keyword.

While using other ingesters like Fluentd etc, you need to create temapltes with required mappings. For more info checkout https://www.elastic.co/guide/en/elasticsearch/reference/current/indices-templates.html