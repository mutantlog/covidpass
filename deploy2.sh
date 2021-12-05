if [[ $(uname -p) == 'i386' ]]; then
  docker build . -t covidpass -t gcr.io/broadcast2patients/covidpass2
  docker push gcr.io/broadcast2patients/covidpass2
  docker image prune -f
else
  gcloud builds submit --tag gcr.io/broadcast2patients/covidpass2
fi

gcloud config set project broadcast2patients
gcloud config set run/region us-east1
gcloud run deploy covidpass2 --image gcr.io/broadcast2patients/covidpass2:latest --platform managed
 
