use crate::ServiceEnv;
use grapl_observe::metric_reporter::MetricReporter;
use rusoto_cloudwatch::CloudWatchClient;
use rusoto_core::{HttpClient, Region};
use rusoto_dynamodb::DynamoDbClient;
use rusoto_s3::{S3Client, S3};
use rusoto_sqs::{Sqs, SqsClient};
use sqs_executor::errors::CheckedError;
use sqs_executor::redis_cache::RedisCache;
use sqs_executor::s3_event_emitter::{OnEventEmit, S3EventEmitter, S3ToSqsEventNotifier};
use sqs_executor::{make_ten, time_based_key_fn};
use std::future::Future;
use std::io::Stdout;
use std::str::FromStr;

#[async_trait::async_trait]
pub trait AsyncFrom<T, S> {
    async fn async_from(t: T) -> S;
}

pub trait FromEnv<S> {
    fn from_env() -> S;
}

impl FromEnv<S3ToSqsEventNotifier<SqsClient>> for S3ToSqsEventNotifier<SqsClient> {
    fn from_env() -> Self {
        let sqs_client = SqsClient::from_env();
        let dest_queue_url = crate::dest_queue_url();
        Self::new(sqs_client, dest_queue_url)
    }
}

impl FromEnv<CloudWatchClient> for CloudWatchClient {
    fn from_env() -> CloudWatchClient {
        let cloudwatch_endpoint = std::env::var("CLOUDWATCH_ENDPOINT").ok();
        let cloudwatch_access_key_id = std::env::var("CLOUDWATCH_ACCESS_KEY_ID").ok();
        let cloudwatch_access_key_secret = std::env::var("CLOUDWATCH_ACCESS_KEY_SECRET").ok();
        let region_name = std::env::var("AWS_REGION").unwrap_or_else(|_| "us-east-1".to_owned());
        match (
            cloudwatch_endpoint,
            cloudwatch_access_key_id,
            cloudwatch_access_key_secret,
        ) {
            (
                Some(cloudwatch_endpoint),
                Some(cloudwatch_access_key_id),
                Some(cloudwatch_access_key_secret),
            ) => CloudWatchClient::new_with(
                HttpClient::new().expect("failed to create request dispatcher"),
                rusoto_credential::StaticProvider::new_minimal(
                    cloudwatch_access_key_id.to_owned(),
                    cloudwatch_access_key_secret.to_owned(),
                ),
                Region::Custom {
                    name: region_name.to_string(),
                    endpoint: cloudwatch_endpoint.to_string(),
                },
            ),
            (Some(cloudwatch_endpoint), None, None) => CloudWatchClient::new(Region::Custom {
                name: region_name.to_string(),
                endpoint: cloudwatch_endpoint.to_string(),
            }),
            (None, None, None) => CloudWatchClient::new(crate::region()),
            _ => {
                panic!("Must specify cloudwatch_endpoint and/or both of cloudwatch_access_key_id, cloudwatch_access_key_secret")
            }
        }
    }
}

impl FromEnv<DynamoDbClient> for DynamoDbClient {
    fn from_env() -> DynamoDbClient {
        let dynamodb_endpoint = std::env::var("DYNAMODB_ENDPOINT").ok();
        let dynamodb_access_key_id = std::env::var("DYNAMODB_ACCESS_KEY_ID").ok();
        let dynamodb_access_key_secret = std::env::var("DYNAMODB_ACCESS_KEY_SECRET").ok();
        let region_name = std::env::var("AWS_REGION").unwrap_or_else(|_| "us-east-1".to_string());

        match (
            dynamodb_endpoint,
            dynamodb_access_key_id,
            dynamodb_access_key_secret,
        ) {
            (
                Some(dynamodb_endpoint),
                Some(dynamodb_access_key_id),
                Some(dynamodb_access_key_secret),
            ) => DynamoDbClient::new_with(
                HttpClient::new().expect("failed to create request dispatcher"),
                rusoto_credential::StaticProvider::new_minimal(
                    dynamodb_access_key_id.to_owned(),
                    dynamodb_access_key_secret.to_owned(),
                ),
                Region::Custom {
                    name: region_name.to_string(),
                    endpoint: dynamodb_endpoint.to_string(),
                },
            ),
            (Some(dynamodb_endpoint), None, None) => DynamoDbClient::new(Region::Custom {
                name: region_name.to_string(),
                endpoint: dynamodb_endpoint.to_string(),
            }),
            (None, None, None) => DynamoDbClient::new(crate::region()),
            _ => {
                panic!("Must specify dynamodb_endpoint and/or both of dynamodb_access_key_id, dynamodb_access_key_secret")
            }
        }
    }
}

impl FromEnv<SqsClient> for SqsClient {
    fn from_env() -> SqsClient {
        let sqs_endpoint = std::env::var("SQS_ENDPOINT").ok();
        let sqs_access_key_id = std::env::var("SQS_ACCESS_KEY_ID").ok();
        let sqs_access_key_secret = std::env::var("SQS_ACCESS_KEY_SECRET").ok();
        let region_name = std::env::var("AWS_REGION").unwrap_or_else(|_| "us-east-1".to_string());

        tracing::info!("overriding sqs_endpoint: {:?}", sqs_endpoint);
        println!("overriding sqs_endpoint: {:?}", sqs_endpoint);
        tracing::info!("overriding sqs_access_key_id: {:?}", sqs_access_key_id);
        println!("overriding sqs_access_key_id: {:?}", sqs_access_key_id);
        tracing::info!(
            "overriding sqs_access_key_secret: {:?}",
            sqs_access_key_secret
        );
        println!(
            "overriding sqs_access_key_secret: {:?}",
            sqs_access_key_secret
        );

        match (sqs_endpoint, sqs_access_key_id, sqs_access_key_secret) {
            (Some(sqs_endpoint), Some(sqs_access_key_id), Some(sqs_access_key_secret)) => {
                SqsClient::new_with(
                    HttpClient::new().expect("failed to create request dispatcher"),
                    rusoto_credential::StaticProvider::new_minimal(
                        sqs_access_key_id.to_owned(),
                        sqs_access_key_secret.to_owned(),
                    ),
                    Region::Custom {
                        name: region_name.to_string(),
                        endpoint: sqs_endpoint.to_string(),
                    },
                )
            }
            (Some(sqs_endpoint), None, None) => SqsClient::new(Region::Custom {
                name: region_name.to_string(),
                endpoint: sqs_endpoint.to_string(),
            }),
            (None, None, None) => SqsClient::new(crate::region()),
            _ => {
                panic!("Must specify sqs_endpoint and/or both of sqs_access_key_id, sqs_access_key_secret")
            }
        }
    }
}

#[tracing::instrument]
pub fn init_s3_client(region_name: &str) -> S3Client {
    let region = match std::env::var("S3_ENDPOINT").ok() {
        Some(custom_endpoint) => Region::Custom {
            name: region_name.to_string(),
            endpoint: custom_endpoint.to_string(),
        },
        None => Region::from_str(&region_name)
            .unwrap_or_else(|e| panic!("Invalid region name: {:?} {:?}", region_name, e)),
    };

    let s3_access_key_id = std::env::var("S3_ACCESS_KEY_ID").ok();
    let s3_access_key_secret = std::env::var("S3_ACCESS_KEY_SECRET").ok();

    match (s3_access_key_id, s3_access_key_secret) {
        (Some(s3_access_key_id), Some(s3_access_key_secret)) => {
            tracing::debug!(
                "init_s3_client. - overriding s3_access_key_id: {:?}",
                s3_access_key_id
            );
            println!(
                "init_s3_client. - overriding s3_access_key_id: {:?}",
                s3_access_key_id
            );
            tracing::debug!(
                "init_s3_client. - overriding s3_access_key_secret: {:?}",
                s3_access_key_secret
            );
            println!(
                "init_s3_client. - overriding s3_access_key_secret: {:?}",
                s3_access_key_secret
            );
            tracing::debug!("init_s3_client. - overriding region_name: {:?}", region);
            println!("init_s3_client. - overriding region_name: {:?}", region);
            S3Client::new_with(
                HttpClient::new().expect("failed to create request dispatcher"),
                rusoto_credential::StaticProvider::new_minimal(
                    s3_access_key_id.to_owned(),
                    s3_access_key_secret.to_owned(),
                ),
                region,
            )
        }
        (None, None) => {
            tracing::debug!("init_s3_client - custom region: {:?}", region);
            S3Client::new(region)
        }
        (_, _) => {
            panic!("Must specify no overrides, or both of s3_access_key_id, s3_access_key_secret")
        }
    }
}

impl FromEnv<S3Client> for S3Client {
    fn from_env() -> S3Client {
        let s3_endpoint = std::env::var("S3_ENDPOINT").ok();
        let s3_access_key_id = std::env::var("S3_ACCESS_KEY_ID").ok();
        let s3_access_key_secret = std::env::var("S3_ACCESS_KEY_SECRET").ok();
        let region_name = std::env::var("AWS_REGION").unwrap_or_else(|_| "us-east-1".to_string());

        tracing::debug!("overriding s3_endpoint: {:?}", s3_endpoint);
        println!("overriding s3_endpoint: {:?}", s3_endpoint);
        tracing::debug!("overriding s3_access_key_id: {:?}", s3_access_key_id);
        println!("overriding s3_access_key_id: {:?}", s3_access_key_id);
        tracing::debug!(
            "overriding s3_access_key_secret: {:?}",
            s3_access_key_secret
        );
        println!(
            "overriding s3_access_key_secret: {:?}",
            s3_access_key_secret
        );
        tracing::debug!("overriding region_name: {:?}", region_name);
        println!("overriding region_name: {:?}", region_name);

        match (s3_endpoint, s3_access_key_id, s3_access_key_secret) {
            (Some(s3_endpoint), Some(s3_access_key_id), Some(s3_access_key_secret)) => {
                S3Client::new_with(
                    HttpClient::new().expect("failed to create request dispatcher"),
                    rusoto_credential::StaticProvider::new_minimal(
                        s3_access_key_id.to_owned(),
                        s3_access_key_secret.to_owned(),
                    ),
                    Region::Custom {
                        name: region_name.to_string(),
                        endpoint: s3_endpoint.to_string(),
                    },
                )
            }
            (Some(s3_endpoint), None, None) => S3Client::new(Region::Custom {
                name: region_name.to_string(),
                endpoint: s3_endpoint.to_string(),
            }),
            (None, None, None) => S3Client::new(crate::region()),
            _ => {
                panic!("Must specify no overrides, or s3_endpoint and/or both of s3_access_key_id, s3_access_key_secret")
            }
        }
    }
}

impl From<&ServiceEnv> for MetricReporter<Stdout> {
    fn from(env: &ServiceEnv) -> Self {
        MetricReporter::new(&env.service_name)
    }
}

pub fn s3_event_emitter_from_env<F, OnEmit, OnEmitError>(
    env: &ServiceEnv,
    key_fn: F,
    on_emit: OnEmit,
) -> S3EventEmitter<S3Client, F, OnEmit, OnEmitError>
where
    F: Clone + Fn(&[u8]) -> String + Send + Sync + 'static,
    OnEmit: Clone + OnEventEmit<Error = OnEmitError> + Send + Sync + 'static,
    OnEmitError: CheckedError + Send + Sync + 'static,
{
    S3EventEmitter::new(
        S3Client::from_env(),
        crate::dest_bucket(),
        key_fn,
        on_emit,
        MetricReporter::new(&env.service_name),
    )
}

pub async fn s3_event_emitters_from_env<F, OnEmit, OnEmitError>(
    env: &ServiceEnv,
    key_fn: F,
    on_emit: OnEmit,
) -> [S3EventEmitter<S3Client, F, OnEmit, OnEmitError>; 10]
where
    F: Clone + Fn(&[u8]) -> String + Send + Sync + 'static,
    OnEmit: Clone + OnEventEmit<Error = OnEmitError> + Send + Sync + 'static,
    OnEmitError: CheckedError + Send + Sync + 'static,
{
    make_ten(async { s3_event_emitter_from_env(env, key_fn, on_emit) }).await
}