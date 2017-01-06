rm -rf build/*
npm run build
cd build
zip_name=`ls *.zip`
unzip logtrail*.zip
cp ../logtrail.json kibana/logtrail-*/
zip -r $zip_name kibana/
