/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT-0
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this
 * software and associated documentation files (the "Software"), to deal in the Software
 * without restriction, including without limitation the rights to use, copy, modify,
 * merge, publish, distribute, sublicense, and/or sell copies of the Software, and to
 * permit persons to whom the Software is furnished to do so.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
 * PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
 * HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
 * OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
 * SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

import {Construct} from "constructs";
import {Effect, PolicyDocument, PolicyStatement, Role, ServicePrincipal} from "aws-cdk-lib/aws-iam";
import {Bucket} from "aws-cdk-lib/aws-s3";
import {NodejsFunction} from "aws-cdk-lib/aws-lambda-nodejs";
import {Aws, CfnOutput, Duration, Environment, StackProps} from "aws-cdk-lib";
import {Runtime} from "aws-cdk-lib/aws-lambda";
import * as path from "path";
import {CfnDeliveryStream} from "aws-cdk-lib/aws-kinesisfirehose";
import {KinesisFirehoseStream} from "aws-cdk-lib/aws-events-targets";
import {CrossAccountDestination} from "aws-cdk-lib/aws-logs";

export interface KinesisDeliveryStreamProps extends StackProps {

    role: Role,
    destinationBucket: Bucket
}

export interface CloudwatchDestinationEndpointProps extends StackProps {
    deliveryStream: CfnDeliveryStream,
    readonly trustedAccounts: Environment[],
    destinationName: string
}

export class CloudwatchDestinationEndpoint extends Construct {
    constructor(scope: Construct, id: string, props: CloudwatchDestinationEndpointProps) {
        super(scope, id);
        const principals = props.trustedAccounts.map(account => {
            return `arn:aws:logs:${account.region}:${account.account}:*`
        })
        //push the current account and region as well
        principals.push(`arn:aws:logs:${Aws.REGION}:${Aws.ACCOUNT_ID}:*`)

        const cloudWatchLogsToKinesisFirehoseRole = new Role(this, `${props.destinationName}-role`, {
            assumedBy: new ServicePrincipal("logs.amazonaws.com").withConditions({
                'StringLike': {
                    "aws:SourceArn": principals
                },
            }),
            inlinePolicies: {
                "0": new PolicyDocument({
                    statements: [new PolicyStatement({
                        effect: Effect.ALLOW,
                        actions: ["firehose:PutRecord","firehose:PutRecordBatch","firehose:ListDeliveryStreams","firehose:DescribeDeliveryStream"],
                        resources: [props.deliveryStream.attrArn],

                    })]
                })
            }

        })
        cloudWatchLogsToKinesisFirehoseRole.grantPassRole(cloudWatchLogsToKinesisFirehoseRole)
        const accounts = props.trustedAccounts.map(account => {
            return account.account
        })
        accounts.push(Aws.ACCOUNT_ID)
        const destinationPolicy = {
            "Effect": "Allow",
            "Principal": {
                "AWS": accounts
            },
            "Action": "logs:PutSubscriptionFilter",
            "Resource": `arn:aws:logs:${Aws.REGION}:${Aws.ACCOUNT_ID}:destination:${props.destinationName}`
        }

        const destination = new CrossAccountDestination(this, props.destinationName, {
            targetArn: props.deliveryStream.attrArn,
            role: cloudWatchLogsToKinesisFirehoseRole,
            destinationName: props.destinationName,
        })

        destination.addToPolicy(PolicyStatement.fromJson(destinationPolicy))
        new CfnOutput(this, `${props.destinationName}-arn`, {
            value: destinationPolicy.Resource
        })
    }
}

export class KinesisDeliveryStream extends Construct {

    readonly deliveryStream: CfnDeliveryStream

    constructor(scope: Construct, id: string, props: KinesisDeliveryStreamProps) {
        super(scope, id);
        const centralizedLoggingRole = props.role
        const bucket = props.destinationBucket
        const kinesisDynamicPartitionLambda = new NodejsFunction(this, "kinesisDynamicPartitionLambda", {
            memorySize: 128,
            timeout: Duration.seconds(5),
            runtime: Runtime.NODEJS_14_X,
            handler: "lambdaHandler",
            entry: path.join(__dirname, `/../runtime/functions/kinesisDynamicPartitionLambda.ts`),

        });
        kinesisDynamicPartitionLambda.grantInvoke(centralizedLoggingRole)
        this.deliveryStream = new CfnDeliveryStream(this, "delivery-stream", {
            deliveryStreamType: "DirectPut",
            deliveryStreamEncryptionConfigurationInput:{
                keyType:"AWS_OWNED_CMK"
            },
            extendedS3DestinationConfiguration: {
                bucketArn: bucket.bucketArn,
                bufferingHints: {
                    intervalInSeconds: 60,
                    sizeInMBs: 64
                },
                prefix: "CentralLogs/AWSLogs/owner=!{partitionKeyFromLambda:owner}/logGroup=!{partitionKeyFromLambda:logGroup}/year=!{timestamp:yyyy}/month=!{timestamp:MM}/day=!{timestamp:dd}/hour=!{timestamp:HH}/",
                errorOutputPrefix: "CentralLogs/AWSLogs/Error/!{firehose:error-output-type}/",
                roleArn: centralizedLoggingRole.roleArn,
                dynamicPartitioningConfiguration: {
                    enabled: true,
                    retryOptions: {
                        durationInSeconds: 10
                    }
                },
                processingConfiguration: {
                    enabled: true,
                    processors: [
                        {
                            type: 'Lambda',
                            parameters: [
                                {
                                    parameterName: 'LambdaArn',
                                    parameterValue: kinesisDynamicPartitionLambda.functionArn,
                                },
                                {
                                    parameterName: 'BufferIntervalInSeconds',
                                    parameterValue: '60',
                                },
                                {
                                    parameterName: 'BufferSizeInMBs',
                                    parameterValue: '3',
                                },
                                {
                                    parameterName: 'NumberOfRetries',
                                    parameterValue: '3',
                                }
                            ],
                        }
                    ],
                },
            }

        })
        bucket.grantReadWrite(centralizedLoggingRole)
        new KinesisFirehoseStream(this.deliveryStream)

    }
}