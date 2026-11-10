classdef TcpJsonStreamer < matlab.System
    % Send synchronized X/Y voltage batches to the Ethernet TCP bridge.
    %
    % Connect a discrete two-element [X, Y] signal to this block. Its sample
    % rate is measured from simulation timestamps for each outgoing batch.

    properties (Nontunable)
        ServerAddress = "192.168.1.20"
        Port = 4000
        SamplesPerMessage = 1000
        RealtimePacing = true
    end

    properties (Access = private)
        Client = []
        Samples = []
        Index = 0
        SampleRate = 0
        FirstSampleTime = 0
        LastSampleTime = 0
        SampleTimeValidated = false
        BatchWallTimer = []
    end

    methods (Access = protected)
        function setupImpl(obj)
            obj.Client = tcpclient(obj.ServerAddress, obj.Port);
            obj.Samples = zeros(obj.SamplesPerMessage, 2);
            obj.Index = 0;
            obj.SampleRate = 0;
            obj.FirstSampleTime = 0;
            obj.LastSampleTime = 0;
            obj.SampleTimeValidated = false;
            obj.BatchWallTimer = tic;
        end

        function stepImpl(obj, voltagePair)
            if ~obj.SampleTimeValidated
                sampleTimeInfo = getSampleTime(obj);
                if ~strcmpi(sampleTimeInfo.Type, 'Discrete') || ...
                        ~isfinite(sampleTimeInfo.SampleTime) || ...
                        sampleTimeInfo.SampleTime <= 0
                    error('TcpJsonStreamer:DiscreteInputRequired', ...
                        ['TcpJsonStreamer needs a discrete input sample time. ', ...
                         'Add a Zero-Order Hold before this block and set its ', ...
                         'sample time.']);
                end
                obj.SampleTimeValidated = true;
            end

            currentTime = getCurrentTime(obj);
            if obj.Index == 0
                obj.FirstSampleTime = currentTime;
            elseif currentTime <= obj.LastSampleTime
                error('TcpJsonStreamer:NonMonotonicTime', ...
                    'Simulation sample times must increase for every input sample.');
            end

            if numel(voltagePair) ~= 2
                error('TcpJsonStreamer:TwoChannelsRequired', ...
                    'Input must be a two-element vector ordered as [X voltage, Y voltage].');
            end

            obj.Index = obj.Index + 1;
            pair = double(voltagePair(:));
            obj.Samples(obj.Index, :) = pair.';
            obj.LastSampleTime = currentTime;

            if obj.Index == obj.SamplesPerMessage
                elapsedTime = obj.LastSampleTime - obj.FirstSampleTime;
                if elapsedTime <= 0
                    error('TcpJsonStreamer:InvalidBatchTime', ...
                        'A sample batch must span a positive amount of simulation time.');
                end
                obj.SampleRate = round((obj.SamplesPerMessage - 1) / elapsedTime);
                if obj.SampleRate <= 0
                    error('TcpJsonStreamer:InvalidSampleRate', ...
                        'The measured sample rate must be positive.');
                end

                payload = struct( ...
                    'sampleRate', obj.SampleRate, ...
                    'xSamples', obj.Samples(:, 1).', ...
                    'ySamples', obj.Samples(:, 2).');
                line = [jsonencode(payload), newline];
                write(obj.Client, uint8(line));

                if obj.RealtimePacing
                    batchDuration = obj.SamplesPerMessage / obj.SampleRate;
                    remainingTime = batchDuration - toc(obj.BatchWallTimer);
                    if remainingTime > 0
                        pause(remainingTime);
                    end
                    obj.BatchWallTimer = tic;
                end
                obj.Index = 0;
            end
        end

        function releaseImpl(obj)
            obj.Client = [];
            obj.Samples = [];
            obj.Index = 0;
            obj.SampleRate = 0;
            obj.FirstSampleTime = 0;
            obj.LastSampleTime = 0;
            obj.SampleTimeValidated = false;
            obj.BatchWallTimer = [];
        end
    end
end
