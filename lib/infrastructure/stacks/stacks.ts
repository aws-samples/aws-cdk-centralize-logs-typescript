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

import {Environment, Stack, StackProps} from 'aws-cdk-lib';
import {Construct} from 'constructs';
import {BlockPublicAccess, Bucket, BucketEncryption} from "aws-cdk-lib/aws-s3";
import {Role, ServicePrincipal} from "aws-cdk-lib/aws-iam";
import {CloudwatchDestinationEndpoint, KinesisDeliveryStream} from "../constructs/constructs";
import {NagSuppressions} from "cdk-nag";

// import * as sqs from 'aws-cdk-lib/aws-sqs';
export interface LogDestinationStackProps extends StackProps {
    trustedAccounts?: Environment[]
    principalOrgIds?: string[]
    regions?: string[]
}

export class LogDestinationStack extends Stack {
    constructor(scope: Construct, id: string, props: LogDestinationStackProps) {
        super(scope, id, props);
        const centralizedLoggingRole = new Role(this, "centralized-logging-role", {
            assumedBy: new ServicePrincipal("firehose.amazonaws.com")

        })

        const centralizedLoggingBucket = new Bucket(this, "centralized-logging-bucket",{
            blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
            serverAccessLogsPrefix: "accessLogs",
            encryption: BucketEncryption.S3_MANAGED,
            enforceSSL: true
        })

        const deliveryStream = new KinesisDeliveryStream(this, "kinesis-delivery-stream", {
            destinationBucket: centralizedLoggingBucket,
            role: centralizedLoggingRole,
        })
        if(props.trustedAccounts!=null) {
            const trustedAccountsByRegion: Map<string, Environment[]> = new Map<string, Environment[]>()
            props.trustedAccounts.forEach(value => {
                if (value.region != null) {
                    const environments = trustedAccountsByRegion.get(value.region)
                    if (environments != null) {
                        environments.push(value)
                    } else {
                        trustedAccountsByRegion.set(value.region, [value])
                    }
                }

            })
            trustedAccountsByRegion.forEach((value, key) => {
                new CloudwatchDestinationEndpoint(this, `${key}-endpoint`, {
                    destinationName: `${key}-endpoint`,
                    deliveryStream: deliveryStream.deliveryStream,
                    trustedAccounts: value
                })
            })
        }else if(props.principalOrgIds!=null){
            if(props.regions!=null && props.regions.length>0) {
                props.regions.forEach(region => {
                    new CloudwatchDestinationEndpoint(this, `${region}-endpoint`, {
                        destinationName: `${region}-endpoint`,
                        deliveryStream: deliveryStream.deliveryStream,
                        principalOrgIds: props.principalOrgIds
                    })
                })
            }else{
                throw new Error("You must specify regions when you specify principalOrgIds")
            }
        }else{
            throw new Error("You must specify either trustedAccounts or principalOrgIds and regions")
        }

        NagSuppressions.addResourceSuppressionsByPath(this,"/LogDestinationStack/centralized-logging-role/DefaultPolicy/Resource", [
            {
                id: "AwsSolutions-IAM5",
                reason: "Wild card permissions granted from CDK grant methods",

            }]
        )
        NagSuppressions.addResourceSuppressionsByPath(this,"/LogDestinationStack/kinesis-delivery-stream/kinesisDynamicPartitionLambda/ServiceRole/Resource", [
            {
                id: "AwsSolutions-IAM4",
                reason: "Ok to use AWS managed policies for Lambda function",

            }]
        )

    }
}
