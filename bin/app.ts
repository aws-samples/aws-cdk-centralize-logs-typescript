#!/usr/bin/env node
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


import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import {LogDestinationStack} from '../lib/stacks/stacks';
import {AwsSolutionsChecks} from "cdk-nag";


const app = new cdk.App();
const env = {
    account: app.node.tryGetContext("account"),
    region: app.node.tryGetContext("region")
}

if (env.account == null || env.region == null) {
    throw Error("Specify account and region via cdk context")
}
const trustedAccountsValue=app.node.tryGetContext("trustedAccounts")

if (trustedAccountsValue == null ) {
    throw Error("Specify trusted accounts for cloudwatch delivery endpoints (-c trustedAccounts=<accountId>:<region>,<accountId>:<region>,...)")
}
const trustedAccounts=(trustedAccountsValue as string).split(",").map(value => {
    const v=value.split(":")
    return {
        account: v[0],
        region: v[1]
    }
})

const logDestinationStack=new LogDestinationStack(app, 'LogDestinationStack', {
    env: env,
    trustedAccounts: trustedAccounts
});
cdk.Aspects.of(logDestinationStack).add(new AwsSolutionsChecks())