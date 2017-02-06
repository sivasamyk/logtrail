@echo off
md build\kibana\logtrail\
copy logtrail.json build\kibana\logtrail\
cd build
"c:\Program Files\7-zip\7z.exe" a logtrail-0.1.7.zip kibana\logtrail\logtrail.json
cd ..