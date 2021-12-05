gcloud builds submit --tag gcr.io/broadcast2patients/covidpass2
gcloud run deploy covidpass2 --image gcr.io/broadcast2patients/covidpass2:latest --platform managed
 
