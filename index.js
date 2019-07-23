import { resolve } from 'path';
import serverRoute from './server/routes/server';

export default function (kibana) {
  return new kibana.Plugin({
    require: ['elasticsearch'],

    uiExports: {

      app: {
        title: 'Auth Logtrail',
        description: 'An awesome Kibana plugin',
        main: 'plugins/auth_logtrail/app',
        url: '/app/auth_logtrail'
      },


      translations: [
      ],


      hacks: [
      ]

    },

    config(Joi) {
      return Joi.object({
        enabled: Joi.boolean().default(true),
      }).default();
    },


    async init(server, options) {

      //세션관리를 위한 변수 선언
      server.auth.api = {session : [], cache : {} };// session = [{ sid: 1234, id: otp, expiresIn: 2018222 },...]

      //세션값 가져오기
      server.auth.api.cache.get = function(sid){
        // server.log (['info','status'],'api.get, sid = '+sid);
        return (server.auth.api.session.filter(i => i.sid == sid))[0];
      };

      //세션값 세팅
      server.auth.api.cache.set = function(sid, id){
        let expires = new Date(new Date().getTime() + 30*60000); //30분
        let sessionInfo = { sid:sid, id:id, expiresIn: expires };

        let oldUserIndex = server.auth.api.session.findIndex( i => i.sid == sid);

        if(oldUserIndex > 0){
          server.auth.api.session[oldUserIndex].expiresIn = expires;
          // server.log (['info','status'],'update api.set, sid = '+JSON.stringify(sessionInfo));
        } else {
          server.auth.api.session.push(sessionInfo);
          // server.log (['info','status'],'new api.set, sid = '+JSON.stringify(sessionInfo));
        }
      };

      //세션값 삭제
      server.auth.api.cache.drop = function(sid){
        server.auth.api.session = server.auth.api.session.filter(i => i.sid != sid);
      };

      //세션값 검사
      server.auth.api.checkSession = function(sid){
        // server.log (['info','status'],'api.checkSession');
        if(!sid) return false;

        // server.log (['info','status'],'sid => '+sid.sid);

        let session = server.auth.api.cache.get(sid.sid);

        if(!session) return false;

        let now = new Date();

        // server.log (['info','status'],'session => '+JSON.stringify(session));
        // server.log (['info','status'],'now => '+now);
        // server.log (['info','status'],'sid.exDt => '+session.expiresIn);

        if(session.expiresIn > now) {
          return true;
        } else {
          //시간 지났으면 케시에서 삭제
          server.auth.api.cache.drop(session.sid);
          return false;
        }
      };

      serverRoute(server);
    }


  });
};
