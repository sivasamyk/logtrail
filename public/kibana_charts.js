const KIBANA_AREA_CHART_URL = "https://localhost:5601/bic/app/kibana#/visualize/create?type=area&indexPattern={{ indexPatternId }}&_g=(refreshInterval:(display:Off,pause:!f,value:0),time:(from:'{{ fromTimestamp }}',mode:absolute,to:'{{ toTimestamp }}'))&_a=(filters:!(),linked:!f,query:(query_string:(analyze_wildcard:!t,query:'logtrail.patternId:{{ logPatternId }}')),uiState:(),vis:(aggs:!((enabled:!t,id:'1',params:(customLabel:'{{ chartLabel }}',field:{{ logFieldName }}),schema:metric,type:avg),(enabled:!t,id:'2',params:(customInterval:'2h',extended_bounds:(),field:'{{ timestampField }}',interval:auto,min_doc_count:1),schema:segment,type:date_histogram)),listeners:(),params:(addLegend:!t,addTimeMarker:!f,addTooltip:!t,categoryAxes:!((id:CategoryAxis-1,labels:(show:!t,truncate:100),position:bottom,scale:(type:linear),show:!t,style:(),title:(text:'{{ xAxisLabel }}'),type:category)),grid:(categoryLines:!f,style:(color:%23eee)),legendPosition:right,seriesParams:!((data:(id:'1',label:'{{ yAxisLabel }}'),drawLinesBetweenPoints:!t,interpolate:linear,mode:stacked,show:true,showCircles:!t,type:area,valueAxis:ValueAxis-1)),times:!(),valueAxes:!((id:ValueAxis-1,labels:(filter:!f,rotate:0,show:!t,truncate:100),name:LeftAxis-1,position:left,scale:(mode:normal,type:linear),show:!t,style:(),title:(text:'{{ title }}'),type:value))),title:'New%20Visualization',type:area))";
const KIBANA_PIE_CHART_URL = "https://localhost:5601/itc/app/kibana#/visualize/create?type=pie&indexPattern={{ indexPatternId }}&_g=(refreshInterval:(display:Off,pause:!f,value:0),time:(from:'{{ fromTimestamp }}',mode:absolute,to:'{{ toTimestamp }}'))&_a=(filters:!(),linked:!f,query:(query_string:(analyze_wildcard:!t,query:'logtrail.patternId:{{ logPatternId }}')),uiState:(),vis:(aggs:!((enabled:!t,id:'1',params:(),schema:metric,type:count),(enabled:!t,id:'2',params:(field:{{ logFieldName }},order:desc,orderBy:'1',size:{{ size }}),schema:segment,type:terms)),listeners:(),params:(addLegend:!t,addTooltip:!t,isDonut:!f,legendPosition:right),title:'{{ title }}',type:pie))";

export const ChartType = {
	PIE:1,
	AREA:2
}

module.exports = function launchChart(chartType, argPopup, selected_index_config) {
	var event = argPopup.event;
	var variableName = argPopup.variableName;
	var className = argPopup.className;
	var title = "LogTrail: Plot for " + variableName + " in context " + className;
	var logFieldName = "logtrail." + event.sourcePattern.fields[argPopup.argNum-1];
	var fromTimestamp = new Date(event.timestamp).rewind({
	  months:1
	});
	var toTimestamp = new Date(event.timestamp).advance({
	  months:1
	});

	var url;

	switch (chartType) {
		case ChartType.AREA:
			url = KIBANA_AREA_CHART_URL.replace(/{{ indexPatternId }}/g,selected_index_config.es.indexPatternId)
			                    .replace(/{{ fromTimestamp }}/g,fromTimestamp)
			                    .replace(/{{ toTimestamp }}/g,toTimestamp)
			                    .replace(/{{ logPatternId }}/g,event.patternInfo.patternId)
			                    .replace(/{{ chartLabel }}/g,encodeURIComponent(title))
			                    .replace(/{{ logFieldName }}/g,logFieldName)
			                    .replace(/{{ timestampField }}/g,selected_index_config.fields.mapping.timestamp)
			                    .replace(/{{ xAxisLabel }}/g,encodeURIComponent(selected_index_config.fields.mapping.timestamp))
			                    .replace(/{{ yAxisLabel }}/g,encodeURIComponent(variableName))
			                    .replace(/{{ title }}/g,encodeURIComponent(variableName));
			break;
		case ChartType.PIE:
			url = KIBANA_PIE_CHART_URL.replace(/{{ indexPatternId }}/g,selected_index_config.es.indexPatternId)
                        .replace(/{{ fromTimestamp }}/g,fromTimestamp)
                        .replace(/{{ toTimestamp }}/g,toTimestamp)
                        .replace(/{{ logPatternId }}/g,event.patternInfo.patternId)
                        .replace(/{{ logFieldName }}/g,logFieldName)
                        .replace(/{{ size }}/g,100)
                        .replace(/{{ title }}/g,encodeURIComponent(variableName));
			break;
	}
	if (url) {
		$window.open(url, '_blank');
	}
};