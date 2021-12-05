if ([[ $(uname -p) == 'i386' ]]; then 
  docker build . -t covidpass -t gcr.io/broadcast2patients/covidpass
  docker push gcr.io/broadcast2patients/covidpass
  docker image prune -f
else
  gcloud builds submit --tag gcr.io/broadcast2patients/covidpass
fi
