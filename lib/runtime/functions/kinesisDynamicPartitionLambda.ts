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

import {
    FirehoseTransformationEventRecord,
    FirehoseTransformationHandler, FirehoseTransformationResult,
    FirehoseTransformationResultRecord,
    KinesisStreamRecord
} from "aws-lambda";
import * as zlib from "zlib"
import {FirehoseTransformationEvent} from "aws-lambda/trigger/kinesis-firehose-transformation";

export const lambdaHandler = async (
    event: FirehoseTransformationEvent, _context: any
): Promise<FirehoseTransformationResult> => {

    // console.log(`Event: ${JSON.stringify(event)}`)
    const records: FirehoseTransformationResultRecord[] = []

    for (const firehoseRecordInput of event.records) {

        const payload = Buffer.from(firehoseRecordInput.data, 'base64');
        const tmp = zlib.gunzipSync(payload).toString('utf-8');
        const jsonVal = JSON.parse(tmp);
        console.log(jsonVal)
        if("DATA_MESSAGE"==jsonVal["messageType"]) {
            const logGroup = (jsonVal["logGroup"] as string)
            records.push({
                recordId: firehoseRecordInput.recordId,
                data: firehoseRecordInput.data,
                result: "Ok",
                metadata: {
                    partitionKeys: {
                        "owner": jsonVal["owner"],
                        "logGroup": logGroup.substring(1,logGroup.length).replace(/\//gi,"-")
                    }
                }
            });
        }else{
            records.push({
                recordId: firehoseRecordInput.recordId,
                data: firehoseRecordInput.data,
                result: "Dropped",

            });
        }

    }

    const results = {
        records: records
    };
    console.log(`Results: ${JSON.stringify(results)}`)
    return results
}