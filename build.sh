rm -rf build/*
npm run build
cd build
zip_name=`ls *.zip`
mkdir kibana
unzip logtrail*.zip -d kibana
cp ../logtrail.json kibana/logtrail-*/
zip -r $zip_name kibana/
