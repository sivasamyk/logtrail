# LogTrail - Log Viewer plugin for Kibana + 로그인 + 권한별 index 선택 기능

LogTrail에 자세한 내용은 [여기](https://github.com/sivasamyk/logtrail/)를 참고하세요

로그인 기능과 권한별 index 선택 기능을 추가했습니다.\
***(부가적으로 메뉴 한글화,날짜 표기 형식 ,로그 정렬에 파일 오프셋 옵션을 추가했습니다.)***

![Events](screenshot.png)

##설명
외부 인터넷망이 가능한 테스트 서버에서 kibana 개발 환경 구성 후\
업무망 pc에서 소스만 개발하는 방법을 설명합니다.

##환경 구성 (Kibana 6.4 기준)

1.nvm 설치
``` bash
curl -o- https://raw.githubusercontent.com/creationix/nvm/v0.34.0/install.sh | bash
source ~/.bashrc
nvm install v8.11.4
nvm use 8.11.4
```
2.yarn 설치
``` bash
npm install -g yarn
```
3.Kibana 개발 환경 구성
``` bash
git clone 키바나 다운로드 경로 or curl -o 등 키바나 프로젝트 다운로드
cd kibana
yarn kbn bootstrap
# 이후 es 등 설정이 필요함 여기서는 파이도 테스트 서버 개발 설정으로 대치
vi config/kibana.yml
 server.port: 포트번호
 server.host: "0.0.0.0"
 elasticsearch.url: "http://ip주소:포트번호"
```
4.플러그인 기본 구조 자동 생성
``` bash
npm install -g yo generator-kibana-plugin
#플러그인 디렉토리와 키바나 디렉토리는 같은 위치에 있어야함
ls -l
 kibana
 my-new-plugin  #여기다가 폴더 생성

cd my-new-plugin
yo kibana-plugin
```
5.실행
```
cd 플러그인소스있는폴더
(nvm use 버전 nvm use --delete-prefix v8.11.4 )
npm start -- --config config/kibana.yml
#아래 로그 확인 후 브라우저에서 접속
optmzr    log   [08:08:32.578] [info][optimize] Optimization success in 197.35 seconds
http://ip주소:포트번호/
```

##개발

1.프로젝트 구성
   * package.json\
   프로젝트 ROOT 디렉토리의 package.json\
   아래와 같이 작성하되 플러그인이름은 폴더 이름과 동일하게 작성되어 합니다.
        ```javascript
        {
          "name": "플러그인이름",
          "version": "1.0.0"
        }
        ```
   * index.js 파일\
   주 모듈 파일로 kibana 플러그인에 전달할 데이터를 여기에 작성합니다.
        ```javascript
        export default function (kibana) {
          return new kibana.Plugin({ ... });
        }
        ```
   * public 디렉토리\
   클라이언트 브라우저에 보여지는 내용들은 이 폴더 안에 작성합니다.

2.플러그인 타입
   * visType\
   새로운 visualization 타입이 필요할 경우 
   * apps\
   별도 메뉴로 구성된 앱 (본 프로젝트는 여기에 해당)
   * fildFormats\
   필드 포멧을 추가할 경우

3.프로젝트 설명
  * 기본 베이스 프로젝트인 logtrail 소스에서 로그인 기능을 추가한 버전입니다.\
  키바나 플러그인 개발시 x-pack(유료) 비활성화 상태에서는 ***hapi-auth-cookie*** 사용에 제약이 있습니다.\
  따라서 클라이언트엔 쿠키로 sid 저장, 서버에 sid 값에 따라 sid, 사용자id, 쿠키 만료 시간을 서버에 저장하여 로그인 세션을 구현였습니다.\
  플러그인 초기화시 세션 기능에 필요한 함수, 변수들을 선언후 router에서 세션을 검사하도록 구현되어있습니다.
   
##플러그인 적용
플러그인 개발 완료후 배포 방법 설명

1.개발된 파일을 zip파일로 압축합니다. ( 아래 명령어 실행 )
```
#플러그인 디렉토리 안에서
npm run build
cd build
#zip 파일 확인
```

2.kibana 플러그인 쉘을 통해 설치 합니다.
```bash
kibana/bin/kibana-plugin install file:///경로/플러그인명.zip
```

3.플러그인 재설치 방법
```bash
kibana/bin/kibana-plugin list
#플러그인명칭 확인

kibana/bin/kibana-plugin remove 플러그인명
#실행 안되면 재설치
```

##설정 파일
기본 설정 파일 형식은 [여기](https://github.com/sivasamyk/logtrail#configuration) 참고
계정 정보는 프로젝트 root 디렉토리에 user.json파일로 작성합니다.
```
{
  "list": [
    {
      "id": "super",
      "pw": "password",
      "indexList": "*" //모든 인덱스를 조회할 계정은 '*' 로 설정
    },
    {
      "id": "apiUser",
      "pw": "password",
      "indexList": ["api*"] //나머지는 배열 형식으로 작성
    },
    {
      "id": "admUser",
      "pw": "password",
      "indexList": ["adm*"]
    }
  ]
}
```