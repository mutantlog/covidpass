import {NextSeo} from 'next-seo';
import {useTranslation} from 'next-i18next';
import {serverSideTranslations} from 'next-i18next/serverSideTranslations';

import Form from '../components/Form';
import Card from '../components/Card';
import Page from '../components/Page';

function Index(): JSX.Element {
    const { t } = useTranslation(['common', 'index', 'errors']);

    const title = 'Ontario Vaccination Record (PDF -> Apple Wallet / Android Wallet)';
    const description = 'Add your Ontario vaccination receipt to your Apple / Android wallet.';

    return (
        <>
            <NextSeo
                title={title}
                description={description}
                openGraph={{
                    url: 'https://receipt2wallet.vaccine-ontario.ca/',
                    title: title,
                    description: description,
                    images: [
                        {
                            url: 'https://covidpass.marvinsextro.de/thumbnail.png',
                            width: 1000,
                            height: 500,
                            alt: description,
                        }
                    ],
                    site_name: title,
                }}
                twitter={{
                    handle: '@vaxtoronto',
                    site: '@vaxtotorono',
                    cardType: 'summary_large_image',
                }}
            />
            <Page content={
                <div className="space-y-5">
                    <Card content={
                        <p>{t('common:subtitle')}&nbsp;{t('index:iosHint')}</p>
                    }/>

                    <Form/>
                </div>
            }/>
        </>
    )
}

export async function getStaticProps({ locale }) {
    return {
        props: {
            ...(await serverSideTranslations(locale, ['common', 'index', 'errors'])),
        },
    };
}

export default Index;
